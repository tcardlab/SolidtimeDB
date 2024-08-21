// pkg imports
import type { Component } from 'solid-js';
import { createEffect, on, createMemo, createSignal, For, getOwner } from 'solid-js'
import { Identity } from "@clockworklabs/spacetimedb-sdk";

// local level import
import { get_client } from '../../STDB/init';
import { STDB_Table, hmrConnect, onInsert, onUpdate, safeConnect, oneOffFind } from '../../STDB/utils'

import {
  /*Tables  */ Message, User, 
  /*Reducers*/ SendMessageReducer, SetNameReducer
} from '@/module_bindings'
import useSubManager from '../../STDB/subManager';


const Messages: Component = () => {
  let client = get_client()
  let subs = useSubManager()

  let [user_id, set_user_id] = createSignal<Identity | undefined>(undefined);
  hmrConnect({
    client,
    perLoad({identity}) {
      console.log('/message Sub')
      subs.setSub([
        "SELECT * FROM User",
        "SELECT * FROM Message"
      ])
      set_user_id(identity);
    }
  })

  // one-off find: assumes connection and identity
  // if client id updated after find started, refilter required
  /*
  let self = oneOffFind(User, (user)=>user.identity.isEqual(client.identity!))
  let user_id = ()=>self()?.identity
  let name = createMemo(()=>userNameOrIdentity(self()))
  */

  /***   System Messages   ***/
  const [systemMessage, setSystemMessage] = createSignal<string[]>([]);
  function appendToSystemMessage(line: string) {
    setSystemMessage(prevMessages => [...prevMessages, line]);
  };


  /***   User   ***/
  // Helper Funcs
  function userNameOrIdentity(user: User|null): string {
    if (!user) return 'unknown'
    if (user.name !== null) {
      return user.name || "";
    }
    else {
      let identityStr = user.identity.toHexString();
      return identityStr.substring(0, 8);
    }
  }

  let getUser = (ID: Identity)=>{
    if(ID === undefined) return null
    let val = User.filterByIdentity(ID).next()
    return val.value;
  }

  // Derived State
  let self = createMemo<User|null>(()=>getUser(user_id()!))
  let name = createMemo(()=>userNameOrIdentity(self()))

  // Actions
  const [newName, setNewName] = createSignal("");
  const [settingName, setSettingName] = createSignal(false);
  const onSubmitNewName = (e: Event) => {
    e.preventDefault()
    setSettingName(false)
    if (name()!==newName())  SetNameReducer.call(newName());
  };

  // Side Effects
  onInsert(User, (user, _, red) => {
    if (user.online && red) {
      appendToSystemMessage(`${userNameOrIdentity(user)} has connected.`);
    }
  })

  onUpdate(User, (user, oldUser) => {
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

  SetNameReducer.on((reducerEvent, reducerArgs) => {
    if (user_id() && reducerEvent.callerIdentity.isEqual(user_id()!)) {
      if (reducerEvent.status === 'failed') {
        appendToSystemMessage(`Error setting name: ${reducerEvent.message} `);
      }
    }
  });



  /***   Messaging   ***/

  // Derived State
  let msgEl: HTMLDivElement;

  // Actions
  //  Send Message
  const [newMessage, setNewMessage] = createSignal("");
  const onMessageSubmit = (e: Event) => {
    e.preventDefault();
    SendMessageReducer.call(newMessage());
    setNewMessage("");
  };

  //  Filter Messages
  let [filter_user, set_filter_user] = createSignal<number>(-1);
  let selected = createMemo(()=>User.all()[filter_user()] || null)
  let [filtered_msgs, change_filter] = STDB_Table(Message, (row:Message) => {
    let user = selected()
    if (user && row) {
      return row.sender?.isEqual(user.identity)
    }
    return true
  })
  // could sort if desired (slightly redundant, so i left it out)
  /* let messages = createMemo(()=>
    filtered_msgs.all().sort((a, b) => a.sent > b.sent ? 1 : a.sent < b.sent ? -1 : 0)
  ) */
  
  // Side Effects
  let scollBottom = () => msgEl.scrollTop = msgEl.scrollHeight;
  onInsert(Message, scollBottom)
  createEffect(on(filtered_msgs.all, scollBottom))

  SendMessageReducer.on((reducerEvent, reducerArgs) => {
    if (user_id() && reducerEvent.callerIdentity.isEqual(user_id()!)) {
      if (reducerEvent.status === 'failed') {
        appendToSystemMessage(`Error sending message: ${reducerEvent.message} `);
      }
    }
  })

  /**  Basic layout  **/
  return (
    <div id='app'>
      <div class="profile">
        <h1>Profile</h1>
        {!settingName() ? (
          <div style="display: flex; justify-content: center; align-items: center; gap: 4px;">
            <p>{name()}</p>
            <button
              onClick={() => {
                setNewName(name())
                setSettingName(true);
              }}
            >
              ✎
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmitNewName} id="idk">
            <input
              id="name" name="name"
              type="text"
              style={{ 'margin-bottom': "1rem" }}
              value={newName()}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" value="Submit">Submit</button>
          </form>
        )}
      </div>

      <h1> User Filter</h1>

      <select name="user-select" id="user-select" 
        value={+filter_user()}
        onChange={(e)=>set_filter_user(+e.target.value)}
      >
        {/* we could wipe the filter with change_filter */}
        <option value={"-1"}>All</option>
        <For each={User.all()}>
          {(user, index) => <option value={index()}>{user.name ?? userNameOrIdentity(user)}</option>}
        </For>
      </select>
      <button onClick={()=>set_filter_user(-1)}>X</button>


      <div class="message" style="display: flex; align-items: center; flex-direction: column;">
        <h1>{selected() ? userNameOrIdentity(selected()!) : "All"} Messages</h1>

        <div style="max-height: 300px; overflow:scroll; width: 300px" ref={msgEl!}>
          {/* <MapIter of={msgs()}> can iterate over map directly */}
          <For each={filtered_msgs.all()} fallback={<div>No Messages</div>}> 
            { (message, key)=>(
              <div data-id={key()}>
                <p>
                  <b>{userNameOrIdentity( getUser(message.sender) )}</b>
                </p>
                <p>{message.text}</p>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="system">
        <h1>System</h1>
        <For each={systemMessage()}>
          {(item, index) => <p data-index={index()}>{item}</p>}
        </For>
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

export default Messages;