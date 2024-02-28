// pkg imports
import type { Component } from 'solid-js';
import { createSignal, For } from 'solid-js'
import { SpacetimeDBClient, Identity, Reducer, ReducerClass, DatabaseTableClass} from "@clockworklabs/spacetimedb-sdk";
import { Table } from '@clockworklabs/spacetimedb-sdk/dist/table';

// root level import
import {
  /*Tables  */ Message, User, 
  /*Reducers*/ SendMessageReducer, SetNameReducer
} from '@/module_bindings'

let arr = [
  Message, User, SendMessageReducer, SetNameReducer
]

for( let STDB_Thing of arr) {
  if (STDB_Thing.prototype instanceof Reducer) {
    SpacetimeDBClient.registerReducers(STDB_Thing as ReducerClass);
  } else {
    SpacetimeDBClient.registerTables(STDB_Thing as DatabaseTableClass);
  }
}

/*
function partition<A, B>(array:any[], isValid:(arg:A|B)=>boolean) {
  return array.reduce(([pass, fail]:[A[], B[]], elem) => {
    return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
  }, [[], []]);
}
const [reducers, tables] = partition<ReducerClass, DatabaseTableClass>(arr, (e) => e.prototype instanceof Reducer );
SpacetimeDBClient.registerReducers(...reducers)
SpacetimeDBClient.registerTables(...tables)
*/


// src level import
import styles from '~/App.module.css'

// Type Defs
export type MessageType = {
  name: string;
  message: string;
};

/**  Create your SpacetimeDB client  **/
let token = localStorage.getItem('auth_token') || undefined;
let spacetimeDBClient = new SpacetimeDBClient("ws://localhost:5000", "stdb-start-db", token);


const App: Component = () => {
  const [newName, setNewName] = createSignal("");
  const [settingName, setSettingName] = createSignal(false);
  const [name, setName] = createSignal("");
  const [systemMessage, setSystemMessage] = createSignal("");
  const [messages, setMessages] = createSignal<MessageType[]>([]);
  
  const [newMessage, setNewMessage] = createSignal("");

  let local_identity: Identity | undefined = undefined;
  let initialized: boolean = false;
  const client: SpacetimeDBClient = spacetimeDBClient;

  /**  onConnect Callback  **/
  client.onConnect((token, identity) => {
    console.log("Connected to SpacetimeDB");

    local_identity = identity;

    localStorage.setItem('auth_token', token);

    client.subscribe([
      "SELECT * FROM User",
      "SELECT * FROM Message"
    ]);
  });


  /**  initialStateSync callback  **/
  function userNameOrIdentity(user: User): string {
    console.log(`Name: ${user.name} `);
    if (user.name !== null) {
      return user.name || "";
    }
    else {
      let identityStr = user.identity.toHexString();
      console.log(`Name: ${identityStr} `);
      return identityStr.substring(0, 8);
    }
  }

  function setAllMessagesInOrder() {
    let messages = Array.from(Message.all());
    messages.sort((a, b) => a.sent > b.sent ? 1 : a.sent < b.sent ? -1 : 0);

    let messagesType: MessageType[] = messages.map((message) => {
      let sender_identity = User.filterByIdentity(message.sender);
      let display_name = sender_identity ? userNameOrIdentity(sender_identity) : "unknown";

      return {
        name: display_name,
        message: message.text,
      };
    });

    setMessages(messagesType);
  }

  client.on("initialStateSync", () => {
    setAllMessagesInOrder();
    let user = User.filterByIdentity( local_identity! );
    setName(userNameOrIdentity( user! ));
  });


  /**  Message.onInsert callback - Update messages  **/
  Message.onInsert((message, reducerEvent) => {
    if (reducerEvent !== undefined) setAllMessagesInOrder();
  });


  /**  User.onInsert callback - Notify about new users  **/
  // Helper function to append a line to the systemMessage state
  function appendToSystemMessage(line: String) {
    setSystemMessage(prevMessage => prevMessage + '\n' + line);
  };

  User.onInsert((user, reducerEvent) => {
    if (user.online) {
      appendToSystemMessage(`${userNameOrIdentity(user)} has connected.`);
    }
  });


  /**  User.onUpdate callback - Notify about updated users  **/
  User.onUpdate((oldUser, user, reducerEvent) => {
    if (oldUser.online === false && user.online === true) {
      appendToSystemMessage(`${userNameOrIdentity(user)} has connected.`);
    }
    else if (oldUser.online === true && user.online === false) {
      appendToSystemMessage(`${userNameOrIdentity(user)} has disconnected.`);
    }

    if (user.name !== oldUser.name) {
      appendToSystemMessage(`User ${userNameOrIdentity(oldUser)} renamed to ${userNameOrIdentity(user)}.`);
    }
  });

  /**  SetNameReducer.on callback - Handle errors and update profile name  **/
  SetNameReducer.on((reducerEvent, reducerArgs) => {
    if (local_identity && reducerEvent.callerIdentity.isEqual(local_identity)) {
      if (reducerEvent.status === 'failed') {
        appendToSystemMessage(`Error setting name: ${reducerEvent.message} `);
      }
      else if (reducerEvent.status === 'committed') {
        setName(reducerArgs[0])
      }
    }
  });


  /**  SendMessageReducer.on callback - Handle errors  **/
  SendMessageReducer.on((reducerEvent, reducerArgs) => {
    if (local_identity && reducerEvent.callerIdentity.isEqual(local_identity)) {
      if (reducerEvent.status === 'failed') {
        appendToSystemMessage(`Error sending message: ${reducerEvent.message} `);
      }
    }
  });


  /**  Update the UI button callbacks  **/
  const onSubmitNewName = (e: Event) => {
    e.preventDefault();
    setSettingName(false);
    SetNameReducer.call(newName());
  };

  const onMessageSubmit = (e: Event) => {
    e.preventDefault();
    SendMessageReducer.call(newMessage());
    setNewMessage("");
  };


  /**  Connecting to the module  **/
  if (!initialized) {
    client.connect();
    initialized = true;
  }

  
  /**  Basic layout  **/
  return (
    <div class={styles.App}>
      <div class="profile">
        <h1>Profile</h1>
        {!settingName() ? (
          <>
            <p>{name()}</p>
            <button
              onClick={() => {
                setSettingName(true);
                setNewName(name());
              }}
            >
              Edit Name
            </button>
          </>
        ) : (
          <form onSubmit={onSubmitNewName}>
            <input
              type="text"
              style={{ 'margin-bottom': "1rem" }}
              value={newName()}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit">Submit</button>
          </form>
        )}
      </div>
      <div class="message">
        <h1>Messages</h1>
        {messages().length < 1 && <p>No messages</p>}
        <div>
          <For each={messages()}>
            {(message, key) => (
              <div data-id={key()}>
                <p>
                  <b>{message.name}</b>
                </p>
                <p>{message.message}</p>
              </div>
            )}
          </For>
        </div>
      </div>
      <div class="system" style={{ 'white-space': 'pre-wrap' }}>
        <h1>System</h1>
        <div>
          <p>{systemMessage()}</p>
        </div>
      </div>
      <div class="new-message">
        <form
          onSubmit={onMessageSubmit}
          style={{
            display: "flex",
            width: "50%",
            margin: "0 auto",
            "flex-direction": "column",
          }}
        >
          <h3>New Message</h3>
          <textarea
            value={newMessage()}
            onChange={(e) => setNewMessage(e.target.value)}
          ></textarea>
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  )
}

export default App;