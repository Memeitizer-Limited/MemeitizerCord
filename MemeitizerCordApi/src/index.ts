import WebpackLoader from "./modules/WebpackLoader"
import Components from "./components/components"
import uuid from "./modules/uuid"
import Utils from "./modules/Utils"
import DiscordTools from "./modules/DiscordTools"
import * as patchers from "./modules/patchers"
import excludeProperties from "./modules/excludeProperties"
import cloneNullProto from "./modules/cloneNullProto"
import NOOP from "./modules/noop"
import unfreeze from "./modules/Unfreeze"
import { isNative, isImported } from "./modules/environnement"
import * as bandagedbdApi from "@bandagedbd/bdapi"
import "./alias/react"
import "./alias/react-dom"
import { LazyLoad } from "./modules/lazyLoader"
import settings from "./modules/settings"
patchers.patch()

/**
 * MemeitizerCord Api defined at [/MemeitizerCordApi/src/index.ts](https://github.com/Memeitizer-Limited/MemeitizerCord/blob/master/MemeitizerCordApi/src/index.ts#L22)
 */
const MemeitizerCordApi = {
    /**
     * WebpackLoader loads Internal Discord's modules with given filter.
     */
    WebpackLoader: WebpackLoader,
    /**
     * MemeitizerCord's exported component. You can see a list in the app settings when activating `Developer Options` in memeitizercord's settings.
     */
    Components: Components,
    /** 
     * Create uuids.
     * @method
     */
    uuid: uuid,
    /**
     * Set of methods that can help you sometimes.
     */
    Utils: Utils,
    DiscordTools: DiscordTools,
    _: {
        excludeProperties: excludeProperties,
        cloneNullProto: cloneNullProto,
        NOOP: NOOP,
        unfreeze: unfreeze
    },
    get isNative(){return isNative},
    get isImported(){return isImported},
    LazyLoad: LazyLoad,
    settings: settings
}

declare global {
    var React:typeof import("react")
    var ReactDOM:typeof import("react-dom")
    interface Window {
        /**
         * MemeitizerCord is only availlaible in MemeitizerCord (native)
         */
        MemeitizerCord: MemeitizerCordGlobal,
        /**
         * BDModules is only availlaible in MemeitizerCord (native)
         */
        BDModules: {
            modules:any[],
            get(filter:(mod:any)=>boolean, modules?:any[]):any[],
            get(id:number, modules?:any[]):any,
            get(ids: [number|((mod:any)=>boolean)], modules?:any[]):any
        },
        BdApi: typeof bandagedbdApi.BdApi,
        EDApi: typeof bandagedbdApi.BdApi,
        ReactDOM: typeof ReactDOM;
        React:typeof React
    }
    var MemeitizerCord:MemeitizerCordGlobal
    var BdApi: typeof bandagedbdApi.BdApi
    var EDApi: typeof bandagedbdApi.BdApi
}

export default MemeitizerCordApi

Object.assign(window.MemeitizerCord.Api, MemeitizerCordApi)

/**
 * The main MemeitizerCord exports. Can be accessed with `window.MemeitizerCord`
 */
export interface MemeitizerCordGlobal {
    /**
     * Some Discord Internal Module shortcuts.
     */
    DiscordModules: {
        /**
         * Internal Discord's dispatcher - can be used to subscribe to gateway events / client events.
         */
        dispatcher: import("./types/DiscordDispatcherTypes").default,
        /**
         * Discord's constants - Can be used to retrieve some infos like Discord's Api Link, Colors, Events, etc...
         */
        constants: import("./types/DiscordConstantsTypes").default
    },
    /** MemeitizerCord's base settings. You don't need to use them. */
    Settings: {
        devMode: boolean,
        callRingingBeat: boolean
    },
    /**
     * MemeitizerCord's Api. This is where all methods/properties memeitizercord adds are.
     */
    Api: MemeitizerCordApiGlobal,
    /** BetterDiscord's Internal Modules. Can be used as well. Example: `MemeitizerCord.BetterDiscord.DOM` for DomTools. */
    BetterDiscord: {
        /** BetterDiscord's plugin api. Can also be accessed with the global variable: `BdApi` */
        BdApi: typeof bandagedbdApi.BdApi,
        [mod:string]:any
    }
}

/**
 * The main Api. Can be accessed with `window.MemeitizerCord.Api`
 */
type MemeitizerCordApiGlobal = memeitizercordApiMainExports & typeof MemeitizerCordApi

/** Exports that are defined [here](https://github.com/MemeitizerCord/MemeitizerCord/blob/master/modules/discord_desktop_core/core/app/BetterDiscord/index.js#L278) */
type memeitizercordApiMainExports = {
    /**
     * Waits until the first module that match the filter gets exported
     * @param filter The filter that specifies the module to match.
     */
    ensureExported(filter: (mod:any) => boolean):Promise<any>,
    /**
     * Recreate the object without the `__proto__` and `prototype` properties - usefull for better formatting in console.
     * @param obj The object to recreate
     */
    cloneNullProto<Obj = any>(obj:Obj):Obj
}