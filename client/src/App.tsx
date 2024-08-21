// pkg imports
import type { Component, JSX } from 'solid-js';
import { getOwner, lazy, Show } from 'solid-js'
import { Router, Route, A, useLocation } from "@solidjs/router";
import { get_client, useClientVals } from '../STDB/init';
import { hmrConnect, safeConnect } from '../STDB/utils';
import useSubManager from '../STDB/subManager';



let Layout = (props:{children?: JSX.Element})=>{
  let loc = useLocation()
  return <>
    <header> 
      <Show when={loc.pathname !=='/'}>
        <a href='/'>{'<- Go Back'}</a>
      </Show> 
    </header>
    {props.children}
  </>
}



const Experiments = lazy(() => import("~/pages/Experiments"));
const Messages = lazy(() => import("~/pages/Messages"));
const Directory: Component = ()=>{
  return (
    <ul>
      <li><A href='/messages'>Messages</A></li>
      <li><A href='/experiments' >Experiments</A></li>
    </ul>
  )
}



const App: Component = () => {
  let client = get_client()
  let subs = useSubManager()
  let clientVals = useClientVals(client)

  /**  onConnect Callback  **/
  hmrConnect({
    client,
    once() {
      console.log("Connected to SpacetimeDB");
      subs.setSub([
        /* universal subs */
        // "SELECT * FROM User",
        // "SELECT * FROM Message"
      ])
    },
    perLoad(){
      //console.log('reloaded')
    }
  })
  safeConnect(client)
  
  return <>
    <Show when={clientVals.live()} fallback={'connecting...'}>
      <Router root={Layout}>
        <Route path="/" component={Directory} />
        <Route path="/messages" component={Messages} />
        <Route path="/experiments" component={Experiments} />
      </Router>
    </Show>
  </>
}

export default App;