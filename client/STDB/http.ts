type Identity = string;
type Address = string;

let WithAuth = true

class HttpClient {
  private host: string;
  private module_name: string;
  private token: string | null;
  private email: string | null;

  constructor(host: string, module_name: string, token: string | null = null, email: string | null = null) {
    this.host = host;
    this.module_name = module_name;
    this.token = token;
    this.email = email;
  }

  private async request<T>(path: string, method: string = 'GET', body?: any, auth=false): Promise<T> {
    const url = `${this.host}${path}`;
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    if (!this.token) {
      let tokenUrl = new URL('identity', this.host)
      let tokenRes = await fetch(tokenUrl, {method: 'POST', body: JSON.stringify({email: this.email})})
      this.token = tokenRes.ok ? (await tokenRes.json()).token : ''
    }
    if(auth) headers['Authorization'] = `Basic ${btoa(`token:${this.token}`)}`;

    let options = {
      method,
      headers,
      body: typeof body !== 'string' ? JSON.stringify(body) : body,
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      console.error(response.statusText)
      throw new Error(`HTTP error! status: ${response.status}\n${url}\n${JSON.stringify(options)}`);
    }

    return response.json() as Promise<T>;
  }

  identity = {
    get: (email: string) => this.request<{ identities: Array<{ identity: string, email: string }> }>(`/identity?email=${email}`),
    post: (email?: string) => this.request<{ identity: string, token: string }>('/identity', 'POST', { email }),
    websocketToken: () => this.request<{ token: string }>('/identity/websocket_token', 'POST'),
    setEmail: (identity: Identity, email: string) => this.request<void>(`/identity/${identity}/set-email?email=${email}`, 'POST'),
    databases: (identity: Identity) => this.request<{ addresses: string[] }>(`/identity/${identity}/databases`),
    verify: (identity: Identity) => this.request<void>(`/identity/${identity}/verify`),
  };

  database = {
    dns: (name: string) => this.request<{ Success: { domain: string, address: string } } | { Failure: { domain: string } }>(`/database/dns/${name}`),
    reverseDns: (address: Address) => this.request<{ names: string[] }>(`/database/reverse_dns/${address}`),
    setName: (address: Address, domain: string, registerTld: boolean = true) => 
      this.request<{ Success: { domain: string, address: string } } | { TldNotRegistered: { domain: string } } | { PermissionDenied: { domain: string } }>(
        `/database/set_name?address=${address}&domain=${domain}&register_tld=${registerTld}`
      ),
    ping: () => this.request<void>('/database/ping'),
    registerTld: (tld: string) => 
      this.request<{ Success: { domain: string } } | { AlreadyRegistered: { domain: string } } | { Unauthorized: { domain: string } }>(
        `/database/register_tld?tld=${tld}`
      ),
    requestRecoveryCode: (identity: Identity, email: string, link: boolean = false) => 
      this.request<void>(`/database/request_recovery_code?identity=${identity}&email=${email}&link=${link}`),
    confirmRecoveryCode: (identity: Identity, email: string, code: string) => 
      this.request<{ identity: string, token: string }>(`/database/confirm_recovery_code?identity=${identity}&email=${email}&code=${code}`),
    publish: (wasmModule: ArrayBuffer, options: { hostType?: string, clear?: boolean, nameOrAddress?: string, registerTld?: boolean } = {}) => 
      this.request<{ Success: { domain: string | null, address: string, op: 'created' | 'updated' } } | { TldNotRegistered: { domain: string } } | { PermissionDenied: { domain: string } }>(
        '/database/publish', 'POST', { ...options, wasmModule: Array.from(new Uint8Array(wasmModule)) }
      ),
    delete: (address: Address) => this.request<void>(`/database/delete/${address}`, 'POST'),
    call: <T = any>(reducer: string, args: any[]) => 
      this.request<T>(`/database/call/${this.module_name}/${reducer}`, 'POST', args),
    schema: (expand: boolean = false) => 
      this.request<{ entities: Record<string, { arity: number, type: 'table' | 'reducer', schema?: any }>, typespace: any[] }>(`/database/schema/${this.module_name}?expand=${expand}`),
    entitySchema: (entityType: 'reducer' | 'table', entity: string, expand: boolean = false) => 
      this.request<{ arity: number, type: 'table' | 'reducer', schema?: any }>(`/database/schema/${this.module_name}/${entityType}/${entity}?expand=${expand}`),
    info: () => 
      this.request<{ address: string, owner_identity: string, host_type: string, initial_program: string }>(`/database/info/${this.module_name}`),
    logs: (numLines?: number, follow: boolean = false) => 
      this.request<string>(`/database/logs/${this.module_name}?${numLines ? `num_lines=${numLines}&` : ''}follow=${follow}`),
    sql: <T = any>(query: string) => 
      this.request<Array<{ schema: any, rows: T[] }>>(`/database/sql/${this.module_name}`, 'POST', query, WithAuth),
  };

  energy = {
    get: (identity: Identity) => this.request<{ balance: string }>(`/energy/${identity}`),
    set: (identity: Identity, balance: string) => this.request<{ balance: string }>(`/energy/${identity}?balance=${balance}`, 'POST'),
  };
}

// Usage example:
async function main() {
  let module_name = 'stdb-start_local';
  let host = 'http://localhost:5000';
  let STDB = new HttpClient(host, module_name);

  // */database/dns
  let dns = await STDB.database.dns(module_name);
  console.log('DNS: ', dns);

  // */database/call
  let create = await STDB.database.call<{ success: boolean }>('send_message', ['Hello from http']);
  console.log('Call Res: ', create);

  // */database/sql
  let sqlQuery = await STDB.database.sql<[string]>('SELECT * FROM Message');
  console.log('SQL Res: ', sqlQuery?.[0].rows.map(v => v[0]));

  // */database/info
  let info = await STDB.database.info();
  console.log('Info Res: ', info);

  // */database/schema
  let schema = await STDB.database.schema();
  console.log('Schema Res: ', schema);
}

main().catch(console.error);