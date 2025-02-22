const ModuleLoader = require("./loaders/modules")
const { EventEmitter } = require("events")
const Logger = require("./Logger")
const fs = require("fs")
const path = require("path")
const electron = require("electron")
const fetch = require("node-fetch").default
const uuid = require("uuid/v4")

const isPackaged = electron.remote.app.isPackaged

const events = exports.events = new EventEmitter()
const logger = exports.logger = new Logger("MemeitizerCord")

let hasInit = false
let tries = 0
let hasReplacedLocalstorage = false
const localStorage = window.localStorage

const UserAgent = electron.ipcRenderer.sendSync("MEMEITIZERCORD_GET_USER_AGENT").replace(/MemeitizerCord\/[^ ]+/g, "discord/"+require("../discord_native/renderer/app").getVersion())
electron.ipcRenderer.sendSync("MEMEITIZERCORD_SET_USER_AGENT", UserAgent)

exports.init = function({
    isTab
}){
    if(hasInit == true){
        console.warn(new Error("MemeitizerCord has already started."))
        return
    }
    formatLogger.log("The app is", isPackaged ? "packaged." : "not packaged.")
    
    hasInit = true
    let readyInterval = setInterval(()=>{
        events.emit("debug", `[INIT] try ${tries++} loading MemeitizerCord`)
        try{
            if(!global.webpackJsonp)return
            if(isTab && !hasReplacedLocalstorage){
                console.log("Replacing localStorage...")
                hasReplacedLocalstorage = true
                const localstr = require("localstorage-polyfill")
                Object.defineProperty(window, "localStorage", {
                    value: localstr
                })
            }
            if(!ModuleLoader.get(4))return
            clearInterval(readyInterval)
            privateInit()
            .then(() => {
                console.log("Finished loading MemeitizerCord.")
            })
        }catch(e){
            console.error(e)
        } 
    }, 100)
}

let hasPrivateInit = false

async function privateInit(){
    if(!hasInit)return
    if(hasPrivateInit)return
    hasPrivateInit = true
    let cached = require.cache[path.join(__dirname, "loaders", "modules.js")]
    if(cached){
        cached.exports = window.BDModules
    }

    //disabling sentry
    ModuleLoader.get(e => e.getCurrentHub)[0].getCurrentHub().getClient().getOptions().enabled = false

    // setting react in require cache
    const React = await ensureExported(e => !["Component", "PureComponent", "Children", "createElement", "cloneElement"].find(k => !e[k]))
    window.React = React

    const ReactDOM = await ensureExported(e => e.findDOMNode)
    window.ReactDOM = ReactDOM

    //stop here if betterdiscord is disabled.
    if(electron.remote.process.argv.includes("--disable-betterdiscord")){
        let formComponents
        let margins
        class MemeitizerCordSettings extends React.Component {
            render(){
                if(!formComponents)formComponents = ModuleLoader.get(e => e.FormSection)[0]
                if(!margins)margins = ModuleLoader.get(e => e.marginTop60)[0]

                let button = require("./Button").default
                
                return React.createElement("div", {}, [
                    React.createElement(formComponents.FormSection, {
                        className: "",
                        tag: "h2",
                        title: "MemeitizerCord's Settings"
                    }, React.createElement(button, { 
                        color: "yellow",
                        look: "ghost",
                        size: "medium",
                        hoverColor: "red",
                        onClick: () => {
                            console.log("Should relaunch")
                            ipcRenderer.sendSync("MEMEITIZERCORD_RELAUNCH_APP", {
                                args: electron.remote.process.argv.slice(1).filter(e => e !== "--disable-betterdiscord")
                            })
                        },
                        wrapper: true
                    }, "Relaunch with BetterDiscord"))
                ])
            }
        }
        
        // fix notifications here
        let dispatcher = ModuleLoader.get(m=>m.Dispatcher&&m.default&&m.default.dispatch)[0].default
        dispatcher.subscribe("USER_SETTINGS_UPDATE", (data) => {
            ipcRenderer.send("DISCORD_UPDATE_THEME", data.settings.theme)
        })

        let constants = ModuleLoader.get(m=>m.API_HOST)[0]

        // add menu to re enable BetterDiscord
        constants.UserSettingsSections = Object.freeze(Object.assign({}, constants.UserSettingsSections, {MEMEITIZERCORD: "MemeitizerCord"}))

        ensureExported(e => e.default && e.default.prototype && e.default.prototype.getPredicateSections)
        .then(settingModule => {
            
            let getPredicateSections = settingModule.default.prototype.getPredicateSections
            settingModule.default.prototype.getPredicateSections = function(){
                let result = getPredicateSections.call(this, ...arguments)
                if(result[1].section === "My Account"){ // user settings, not guild settings
                    let poped = []
                    
                    poped.push(result.pop())
                    poped.push(result.pop())
                    poped.push(result.pop())
                    poped.push(result.pop())

                    result.push({
                        section: "HEADER",
                        label: "MemeitizerCord"
                    }, {
                        section: constants.UserSettingsSections.MEMEITIZERCORD,
                        label: "MemeitizerCord",
                        element: MemeitizerCordSettings
                    }, {
                        section: "DIVIDER"
                    })

                    while(poped[0]){
                        result.push(poped.pop())
                    }
                }
                return result
            }
        })
        installReactDevtools()

        return
    }
    
    let soundModule = await ensureExported((e) =>  e.createSound)
    let createSound = soundModule.createSound
    soundModule.createSound = function(sound){
        let isCalling = sound === "call_ringing_beat" || sound === "call_ringing"
        if(isCalling){
            let returned = createSound.call(this, ...arguments)
            Object.defineProperty(returned, "name", {
                get(){
                    return window.MemeitizerCord.Settings.callRingingBeat ? "call_ringing_beat" : "call_ringing"
                },
                set(data){
                    console.log("Attempting to set call_ringing value. Canceling", data)
                },
                configurable: false
            })
            return returned
        }else{
            return createSound(...arguments)
        }
    }

    let constants = ModuleLoader.get(m=>m.API_HOST)[0]
    let dispatcher = ModuleLoader.get(m=>m.Dispatcher&&m.default&&m.default.dispatch)[0].default
    require(formatMinified(path.join(__dirname, "../../../../../BetterDiscordApp/dist/style{min}.css")))
    require("./MemeitizerCord.css")

    function getCurrentHypesquad(){
        let user = ModuleLoader.get(e => e.default && e.default.getCurrentUser)[0].default.getCurrentUser()
        if(!user)return undefined
        if(user.hasFlag(constants.UserFlags.HYPESQUAD_ONLINE_HOUSE_1))return "1"
        if(user.hasFlag(constants.UserFlags.HYPESQUAD_ONLINE_HOUSE_2))return "2"
        if(user.hasFlag(constants.UserFlags.HYPESQUAD_ONLINE_HOUSE_3))return "3"
        return undefined
    }
    
    window.$ = window.jQuery = require("./jquery-3.6.0.slim.min.js")
    require("./ace.js")
    installReactDevtools()

    if(!fs.existsSync(BetterDiscordConfig.dataPath))fs.mkdirSync(BetterDiscordConfig.dataPath, {recursive: true})
    let pluginPath = path.join(BetterDiscordConfig.dataPath, "plugins")
    let themePath = path.join(BetterDiscordConfig.dataPath, "themes")
    console.log(`Plugins: ${pluginPath}\nThemes: ${themePath}`)
    if(!fs.existsSync(pluginPath)){
        fs.mkdirSync(pluginPath, {recursive: true})

        /** Downloads Util Plugins So the user don't have to install it manually */

        /** ZeresPluginLibrary */
        const ZeresPluginLibraryPath = path.join(pluginPath, "0PluginLibrary.plugin.js")
        fetch("https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js")
        .then(async res => {
            if(res.status !== 200)return
            const content = await res.buffer()
            fs.writeFileSync(ZeresPluginLibraryPath, content)
        })

        BetterDiscordConfig.haveInstalledDefault = true // Inform User about what we just did
    }
    if(!fs.existsSync(themePath)){
        fs.mkdirSync(themePath, {recursive: true})

        /** Downloads Basic Themes to guide user and showcase features */

        /** Discord Dark */
        const DarkDiscordPath = path.join(themePath, "DarkDiscord.theme.css")
        fetch("https://raw.githubusercontent.com/hormelcookies/dark-discord/hormelcookies-patch-1/DarkDiscord.theme.css")
        .then(async res => {
            if(res.status !== 200)return
            const content = await res.buffer()
            fs.writeFileSync(DarkDiscordPath, content)
        })

        /** Glasscord Example */
        const GlasscordExamplePath = path.join(themePath, "glasscord_example.theme.css")
        fetch("https://raw.githubusercontent.com/AryToNeX/Glasscord/master/extras/discord_example_theme/discord_example.theme.css")
        .then(async res => {
            if(res.status !== 200)return
            const content = await res.buffer()
            fs.writeFileSync(GlasscordExamplePath, content)
        })

        BetterDiscordConfig.haveInstalledDefault = true // Inform User about what we just did
    } else {
        // Remove darkdiscord if exists, replace with known good version
        const DarkDiscordPath = path.join(themePath, "DarkDiscord.theme.css")
        let names = [ DarkDiscordPath, path.join(themePath, "DiscordDark.theme.css")];
        //check for dark discord and its alternative names
        for (name of names){
            if (fs.existsSync(name)){
                let data = fs.readFileSync(name, "utf-8");
                if (data.includes("hellbound")){
                    fs.unlinkSync(name)
                    fetch("https://raw.githubusercontent.com/hormelcookies/dark-discord/hormelcookies-patch-1/DarkDiscord.theme.css")
                    .then(async res => {
                        if(res.status !== 200)return
                        const content = await res.buffer()
                        // write to the canonical path
                        fs.writeFileSync(DarkDiscordPath, content)
                    })
                }
            }    
        }
    }
    
    // setting Discord Internal Developer Mode for developement and test purposes.
    let developerModule = ModuleLoader.get(e => e.default && typeof e.default === "object" && ("isDeveloper" in e.default))[0]
    if(developerModule){
        Object.defineProperty(developerModule.default, "isDeveloper", {
            get(){return !!window.MemeitizerCord.Settings.devMode},
            set(data){return !!window.MemeitizerCord.Settings.devMode}
        })
    }

    /**
     * @type {typeof import("../../../../../DiscordJS").default}
     */
    let DiscordJS
    try{
        DiscordJS = require("../../../../../DiscordJS").default
    }catch(err){
        console.error(err)
        DiscordJS = null
    }

    let cloneNullProto = (obj) => { // recreate object without __proto__
        let o = Object.create(null)
        Object.keys(obj).forEach(k => {
            o[k] = obj[k]
        })
        return o
    }

    window.MemeitizerCord = cloneNullProto({
        DiscordModules: cloneNullProto({
            dispatcher,
            constants
        }),
        Settings: cloneNullProto({
            devMode: false,
            callRingingBeat: true
        }),
        Api: cloneNullProto({
            Authorization: null,
            ensureExported,
            cloneNullProto
        }),
        BetterDiscord: cloneNullProto({ // Global BetterDiscord's exported modules

        })
    })

    dispatcher.subscribe("USER_SETTINGS_UPDATE", (data) => {
        ipcRenderer.send("DISCORD_UPDATE_THEME", data.settings.theme)
    })

    require(formatMinified("MemeitizerCordapi/js/main{min}.js"))

    /*
    if(shouldShowPrompt){
        let onConn = (ev) => {
            console.log(`Showing auth window.`, ev)
            shouldShowPrompt = false
            dispatcher.unsubscribe(constants.ActionTypes.CONNECTION_OPEN || "CONNECTION_OPEN", onConn)

            const options = {
                width: 500,
                height: 550,
                backgroundColor: "#202225",
                show: true,
                resizable: false,
                maximizable: false,
                minimizable: false,
                frame: false,
                center: false,
                webPreferences: {
                    nodeIntegration: false,
                    preload: path.join(__dirname, "auth", "preload.js"),
                    webviewTag: true
                },
                parent: electron.remote.getCurrentWindow()
            };
            options.x = Math.round(window.screenX + window.innerWidth / 2 - options.width / 2);
            options.y = Math.round(window.screenY + window.innerHeight / 2 - options.height / 2);

            const authWindow = new electron.remote.BrowserWindow(options)
            
            authWindow.webContents.session.protocol.registerFileProtocol("MemeitizerCord", (req, callback) => {
                const parsedURL = new URL("http://MemeitizerCord.xyz/"+req.url.split("://")[1])

                let file
                if(req.method !== "GET"){
                    file = "404.html"
                }else{
                    if(parsedURL.pathname === "/index.html"){
                        file = "index.html"
                    }else if(parsedURL.pathname === "/index.css"){
                        file = "index.css"
                    }else if(parsedURL.pathname === "/login/callback"){
                        authWindow.close()
                        console.log(parsedURL.searchParams)
                        Authorization = parsedURL.searchParams.get("auth")
                        authWindow = null
                        return
                    }
                }

                if(!file){
                    file = "404.html"
                }

                callback(path.join(__dirname, "auth", file))
            }, (err) => {
                if(err)console.error(err)
            })

            electron.remote.getCurrentWindow().webContents.on("devtools-reload-page", () => {
                electron.remote.protocol.unregisterProtocol("MemeitizerCord")
            })

            authWindow.on("close", () => {
                electron.remote.protocol.unregisterProtocol("MemeitizerCord")
            })

            authWindow.loadURL("MemeitizerCord://index.html")
        }
        dispatcher.subscribe(constants.ActionTypes.CONNECTION_OPEN || "CONNECTION_OPEN", onConn)
    }*/

    const BetterDiscord = new(require(formatMinified("../../../../../BetterDiscordApp/dist/index{min}.js")).default)(BetterDiscordConfig, require("./betterdiscord"))

    const Utils = window.MemeitizerCord.BetterDiscord.Utils
    const DOMTools = window.MemeitizerCord.BetterDiscord.DOM

    let isBot = false
    dispatcher.subscribe("LOGOUT", () => {
        isBot = false
    })
    const appSettings = window.MemeitizerCord.Api.settings
    ;(async function(){
        const gatewayModule = await ensureExported(e => e.default && e.default.prototype && e.default.prototype._handleDispatch)
        if(!gatewayModule)return
        let _handleDispatch = gatewayModule.default.prototype._handleDispatch
        gatewayModule.default.prototype._handleDispatch = function(data, event, props){
            if(event === "READY"){
                console.log(...arguments)
                if(false){
                    dispatcher.dispatch({
                        type: "LOGOUT"
                    })
                    BdApi.showToast(data.user.username+"#"+data.user.discriminator+": This account is blacklisted from MemeitizerCord.", {
                        type: "error", 
                        timeout: 10000
                    })
                    appSettings.get("­", true)
                    appSettings.save()
                    return
                }
                isBot = data.user.bot
                if(data.user.bot){
                    logger.log(`Logged in as a bot, spoofing user...`)
                    data.user.bot = false
                    data.user.premium = true
                    data.user.premium_type = 1
                    data.user.email = data.user.email || uuid()+"@MemeitizerCord.xyz" // filler email, not a real one
                    data.experiments = data.experiments || []
                    data.guild_experiments = data.guild_experiments || [];
                    data.connected_accounts = data.connected_accounts || [];
                    data.relationships = data.relationships || [];
                    data.notes = data.notes || {};
                    data.user_feed_settings = data.user_feed_settings || [];
                    data.analytics_tokens = data.analytics_tokens || [];
                    data.analytics_token = data.analytics_token || ""
                    data.private_channels = data.private_channels || [];
                    data.read_state = data.read_state || {
                        entries: [],
                        partial: false,
                        version: 19438
                    }
                    data.consents = data.consents || {
                        personalization: false
                    }
                    data.tutorial = data.tutorial || null
                    data.user_settings = Object.assign(data.user_settings || {}, {
                        afk_timeout: 600,
                        allow_accessibility_detection: false,
                        animate_emoji: true,
                        contact_sync_enabled: false,
                        convert_emoticons: true,
                        custom_status: null,
                        default_guilds_restricted: false,
                        detect_platform_accounts: false,
                        developer_mode: true,
                        disable_games_tab: true,
                        enable_tts_command: true,
                        explicit_content_filter: 0,
                        friend_source_flags: {
                            all: false, 
                            mutual_friends: false, 
                            mutual_guilds: false
                        },
                        gif_auto_play: true,
                        guild_folders: [],
                        guild_positions: [],
                        inline_attachment_media: true,
                        inline_embed_media: true,
                        message_display_compact: false,
                        native_phone_integration_enabled: false,
                        render_embeds: true,
                        render_reactions: true,
                        restricted_guilds: [],
                        show_current_game: false,
                        stream_notifications_enabled: false
                    }, data.user_settings || {})
                    data.user_guild_settings = data.user_guild_settings || {
                        entries: [],
                        version: 0,
                        partial: false
                    }
                    data.friend_suggestion_count = data.friend_suggestion_count || 0
                    data.presences = data.presences || []
                    const buildInfo = electron.ipcRenderer.sendSync("MEMEITIZERCORD_GET_BUILD_INFOS")
                    electron.ipcRenderer.sendSync("MEMEITIZERCORD_SET_USER_AGENT", `DiscordBot (https://github.com/Memeitizer-Limited/MemeitizerCord, v${buildInfo.version})`)
                }else{
                    electron.ipcRenderer.sendSync("MEMEITIZERCORD_SET_USER_AGENT", UserAgent)
                    logger.log(`Logged in as an user. Skipping user spoofing.`)
                }
            }
            let returnValue = _handleDispatch.call(this, ...arguments)
            if(event === "READY" && DiscordJS){
                try{
                    DiscordJS.client.emit("self.ready", data)
                }catch(e){
                    console.error("[DiscordJS Error]", e)
                }
            }
            return returnValue
        }
        dispatcher.subscribe("LOGOUT", () => {
            isBot = false
        })
        function cancelGatewayPrototype(methodName){
            if(gatewayModule.default.prototype[methodName]){
                const original = gatewayModule.default.prototype[methodName]
                gatewayModule.default.prototype[methodName] = function(){
                    if(!isBot)return original.call(this, ...arguments)
                }
            }else{
                logger.warn(`Couldn't find ${methodName} on gateway.`)
            }
        }
        cancelGatewayPrototype("updateGuildSubscriptions")
        cancelGatewayPrototype("callConnect")
        cancelGatewayPrototype("lobbyConnect")
        cancelGatewayPrototype("lobbyDisconnect")
        cancelGatewayPrototype("lobbyVoiceStatesUpdate")
        cancelGatewayPrototype("streamCreate")
        cancelGatewayPrototype("streamWatch")
        cancelGatewayPrototype("streamPing")
        cancelGatewayPrototype("streamDelete")
        cancelGatewayPrototype("streamSetPaused")

        const _handleClose = gatewayModule.default.prototype._handleClose
        gatewayModule.default.prototype._handleClose = function(wasClean, code, reason){
            let shouldSetIntents = !this.intents
            delete this.intents
            if(code === 4013 && shouldSetIntents){
                this.intents = 32509
            }else if(code === 4014){
                delete this.intents
                console.log(`Invalid intents ? Removing them.`)
            }
            return _handleClose.call(this, ...arguments)
        }

        const _doIdentify = gatewayModule.default.prototype._doIdentify
        gatewayModule.default.prototype._doIdentify = function(){
            let originalSend = this.send
            this.send = function(op, data, idkwhat){
                if(op === 2){
                    if(this.intents){
                        data.intents = this.intents
                    }
                }
                return originalSend.call(this, op, data, idkwhat)
            }
            const returnValue = _doIdentify.call(this, ...arguments)
            this.send = originalSend
            return returnValue
        }


        const requestGuildMembers = gatewayModule.default.prototype.requestGuildMembers
        gatewayModule.default.prototype.requestGuildMembers = function(){ // TODO: requestGuildMembers patch for bots.
            /*if(!isBot)*/return requestGuildMembers.call(this, ...arguments)
            console.log(arguments)
        }

        const hasUnreadModules = BDModules.get(e => e.default && e.default.hasUnread)
        hasUnreadModules.forEach((mod) => {
            const hasUnread = mod.default.hasUnread
            mod.default.hasUnread = function(){
                if(isBot)return false
                return hasUnread.call(this, ...arguments)
            }
            for (const fName of ['ack']) {
                console.log(fName, mod[fName])
                if(!mod || !mod[fName]){
                    logger.warn("Couldn't find prop "+fName+" in ackmodule1")
                    continue
                }
                let original = mod[fName]
                mod[fName] = function(){
                    if(!isBot)return original.call(this, ...arguments)
                }
            }
            if(mod.getAckTimestamp){
                let getAckTimestamp = mod.getAckTimestamp
                mod.getAckTimestamp = function(){
                    if(!isBot)return getAckTimestamp.call(this, ...arguments)
                    return NaN
                }
            }
        })
        const getTokenModule = ModuleLoader.get(e => e.default && e.default.getToken)[0]
        if(getTokenModule){
            const getToken = getTokenModule.default.getToken
            getTokenModule.default.getToken = function(){
                const token = getToken.call(this)
                if(!token)return token
                if(isBot)return token.startsWith("Bot ") ? token : "Bot " + token
                return token
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const relationshipsModule = BDModules.get(e => e.default && e.default.fetchRelationships)[0]
        if(relationshipsModule){
            const fetchRelationships = relationshipsModule.default.fetchRelationships
            relationshipsModule.default.fetchRelationships = function(){
                if(!isBot)return fetchRelationships.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.LOAD_RELATIONSHIPS_SUCCESS,
                        relationships: []
                    })
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const consentModule = BDModules.get(e => e.fetchConsents)[0]
        if(consentModule){
            const fetchConsents = consentModule.fetchConsents
            consentModule.fetchConsents = function(){
                if(!isBot)return fetchConsents.call(this, ...arguments)
                setImmediate(()=>{
                    dispatcher.dispatch({
                        type: constants.ActionTypes.UPDATE_CONSENTS,
                        consents: {
                            personalization: false,
                            usage_statistics: false
                        }
                    })
                })
            }
            const setConsents = consentModule.setConsents
            consentModule.setConsents = function(){
                if(!isBot)return setConsents.call(this, ...arguments)
                return Promise.reject(new Error("MemeitizerCord bot emulation cannot change this setting."))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const harvestModule = BDModules.get(e => e.getHarvestStatus)[0]
        if(harvestModule){
            const getHarvestStatus = harvestModule.getHarvestStatus
            harvestModule.getHarvestStatus = function(){
                if(!isBot)return getHarvestStatus.call(this, ...arguments)
                return Promise.resolve({
                    requestingHarvest: false,
                    currentHarvestRequest: null
                })
            }
            const requestHarvest = harvestModule.requestHarvest
            harvestModule.requestHarvest = function(){
                if(!isBot)return requestHarvest.call(this, ...arguments)
                return Promise.reject()
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const harvestDisabledModule = BDModules.get(e => e.getSanitizedRestrictedGuilds)[0]
        if(harvestDisabledModule){
            const harvestDisabled = harvestDisabledModule.harvestDisabled
            harvestDisabledModule.harvestDisabled = function(){
                if(!isBot)return harvestDisabled.call(this, ...arguments)
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const settingModule = BDModules.get(e => e.default && e.default.updateRemoteSettings)[0]
        if(settingModule){
            const updateRemoteSettings = settingModule.default.updateRemoteSettings
            settingModule.default.updateRemoteSettings = function(){
                if(isBot)return Promise.resolve()
                return updateRemoteSettings.call(this, ...arguments)
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const oauth2Module = BDModules.get(e => e.default && Object.keys(e.default).length === 2 && e.default.fetch && e.default.delete)[0]
        if(oauth2Module){
            const fetch = oauth2Module.default.fetch
            oauth2Module.default.fetch = function(){
                if(!isBot)return fetch.call(this, ...arguments)
                setImmediate(()=>{
                    dispatcher.dispatch({
                        type: constants.ActionTypes.USER_AUTHORIZED_APPS_UPDATE,
                        apps: []
                    })
                })
            }
            const deleteFunc = oauth2Module.delete
            oauth2Module.delete = function(){
                if(!isBot)return deleteFunc.call(this, ...arguments)
                oauth2Module.fetch()
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const paymentModule = BDModules.get(e => e.fetchPaymentSources)[0]
        if(paymentModule){
            const fetchPaymentSources = paymentModule.fetchPaymentSources
            paymentModule.fetchPaymentSources = function(){
                if(!isBot)return fetchPaymentSources.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.BILLING_PAYMENT_SOURCES_FETCH_START
                    })
                    setImmediate(() => {
                        dispatcher.dispatch({
                            type: constants.ActionTypes.BILLING_PAYMENT_SOURCES_FETCH_SUCCESS,
                            paymentSources: []
                        })
                    })
                })
            }
            const fetchPayments = paymentModule.fetchPayments
            paymentModule.fetchPayments = function(){
                if(!isBot)return fetchPayments.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.BILLING_PAYMENTS_FETCH_START
                    })
                    setImmediate(() => {
                        dispatcher.dispatch({
                            type: constants.ActionTypes.BILLING_PAYMENTS_FETCH_SUCCESS,
                            payments: []
                        })
                    })
                })
            }
            const fetchSubscriptions = paymentModule.fetchSubscriptions
            paymentModule.fetchSubscriptions = function(){
                if(!isBot)return fetchSubscriptions.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.BILLING_SUBSCRIPTION_FETCH_START
                    })
                    setImmediate(() => {
                        const subs = [
                            {
                                "id": "123456789",
                                "type": 1,
                                "created_at": "2020-06-00T00:00:00.000000",
                                "canceled_at": null,
                                "current_period_start": "2020-06-00:00:00.000000",
                                "current_period_end": "2100-06-00:00:00.000000",
                                "status": 1,
                                "payment_source_id": null,
                                "payment_gateway": null,
                                "payment_gateway_plan_id": "premium_year",
                                "plan_id": "511651860671627264",
                                "items": [
                                    {
                                        "id": "123456789",
                                        "plan_id": "511651860671627264",
                                        "quantity": 1
                                    }
                                ],
                                "currency": "usd"
                            }
                        ]
                        resolve({
                            body: subs
                        })
                        dispatcher.dispatch({
                            type: constants.ActionTypes.BILLING_SUBSCRIPTION_FETCH_SUCCESS,
                            subscriptions: subs
                        })
                    })
                })
                let resolve
                return new Promise((res) => (resolve = res))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const markServerReadShortcut = BDModules.get(e => e.MARK_SERVER_READ)[0]
        if(markServerReadShortcut){
            let action = markServerReadShortcut.MARK_SERVER_READ.action
            markServerReadShortcut.MARK_SERVER_READ.action = function(){
                if(isBot)return
                return action.call(this, ...arguments)
            }
            markServerReadShortcut.default && markServerReadShortcut.default.MARK_SERVER_READ && (markServerReadShortcut.default.MARK_SERVER_READ.action = markServerReadShortcut.MARK_SERVER_READ.action)
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const applicationStatisticModule = BDModules.get(e => e.fetchActivityStatistics)[0]
        if(applicationStatisticModule){
            const fetchActivityStatistics = applicationStatisticModule.fetchActivityStatistics
            applicationStatisticModule.fetchActivityStatistics = function(){
                if(!isBot)return fetchActivityStatistics.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.USER_ACTIVITY_STATISTICS_FETCH_SUCCESS,
                        statistics: []
                    })
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const subsInvoiceModule = BDModules.get(e => e.fetchSubscriptionInvoicePreview)[0]
        if(subsInvoiceModule){
            function adapt(data){
                return {
                    id: data.id,
                    invoiceItems: data.invoice_items.map(function(e) {
                        return {
                            id: e.id,
                            subscriptionPlanId: e.subscription_plan_id,
                            subscriptionPlanPrice: e.subscription_plan_price,
                            amount: e.amount,
                            quantity: e.quantity,
                            discounts: e.discounts
                        }
                    }),
                    total: data.total,
                    subtotal: data.subtotal,
                    currency: data.currency,
                    tax: data.tax,
                    taxInclusive: data.tax_inclusive,
                    subscriptionPeriodStart: new Date(data.subscription_period_start),
                    subscriptionPeriodEnd: new Date(data.subscription_period_end)
                }
            }
            const fetchSubscriptionInvoicePreview = subsInvoiceModule.fetchSubscriptionInvoicePreview
            subsInvoiceModule.fetchSubscriptionInvoicePreview = function(){
                if(!isBot)return fetchSubscriptionInvoicePreview.call(this, ...arguments)
                const arg1 = arguments[0]
                if(!arg1 || !arg1.subscriptionId || arg1.subscriptionId === "123456789"){
                    return new Promise((resolve, reject) => {
                        let data = adapt({
                            "id": "123456789", 
                            "invoice_items": [{
                                "id": "123456789", 
                                "amount": 0, 
                                "discounts": [], 
                                "subscription_plan_id": "511651860671627264", 
                                "subscription_plan_price": 0, 
                                "quantity": 1, 
                                "proration": false
                            }], 
                            "total": 100,
                            "subtotal": 100, 
                            "currency": "usd", 
                            "tax": 0, 
                            "tax_inclusive": true, 
                            "subscription_period_start": "2020-06-00:00:00.000000", 
                            "subscription_period_end": "2100-06-00:00:00.000000"
                        })
                        console.log(data)
                        resolve(data)
                    })
                }
                return fetchSubscriptionInvoicePreview.call(this, ...arguments)
            }
            const useSubscriptionInvoice = subsInvoiceModule.useSubscriptionInvoice
            subsInvoiceModule.useSubscriptionInvoice = function(){
                if(!isBot)return useSubscriptionInvoice.call(this, ...arguments)
                return useSubscriptionInvoice.call(this, Object.assign(arguments[0], {preventFetch: true}), ...Array.from(arguments).slice(1))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const subsModule = BDModules.get(e => e.fetchUserPremiumGuildSubscriptionSlots)[0]
        if(subsModule){
            const fetchUserPremiumGuildSubscriptionSlots = subsModule.fetchUserPremiumGuildSubscriptionSlots
            subsModule.fetchUserPremiumGuildSubscriptionSlots = function(){
                if(!isBot)return fetchUserPremiumGuildSubscriptionSlots.call(this, ...arguments)
                setImmediate(()=>{
                    dispatcher.dispatch({
                        type: constants.ActionTypes.USER_PREMIUM_GUILD_SUBSCRIPTION_SLOTS_FETCH_SUCCESS,
                        userPremiumGuildSubscriptionSlots: []
                    })
                })
            }
            const fetchPremiumSubscriptionCooldown = subsModule.fetchPremiumSubscriptionCooldown
            subsModule.fetchPremiumSubscriptionCooldown = function(){
                if(!isBot)return fetchPremiumSubscriptionCooldown.call(this, ...arguments)
                return new Promise((resolve, reject) => {
                    reject(new Error("MemeitizerCord bot emulation cannot use Server Boosts"))
                })
            }
            const fetchPremiumSubscriptions = subsModule.fetchPremiumSubscriptions
            subsModule.fetchPremiumSubscriptions = function(){
                if(!isBot)return fetchPremiumSubscriptions.call(this, ...arguments)
                return new Promise((resolve, reject) => {
                    reject(new Error("MemeitizerCord bot emulation cannot use Server Boosts"))
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const entitlementsModule = BDModules.get(e => e.fetchUserEntitlementsForApplication)[0]
        if(entitlementsModule){
            const fetchUserEntitlementsForApplication = entitlementsModule.fetchUserEntitlementsForApplication
            entitlementsModule.fetchUserEntitlementsForApplication = function(){
                if(!isBot)return fetchUserEntitlementsForApplication.call(this, ...arguments)
                let resolve
                setImmediate(()=>{
                    dispatcher.dispatch({
                        type: constants.ActionTypes.ENTITLEMENT_FETCH_APPLICATION_START,
                        applicationId: arguments[0]
                    })
                    setImmediate(()=>{
                        resolve([])
                        dispatcher.dispatch({
                            type: constants.ActionTypes.ENTITLEMENT_FETCH_APPLICATION_SUCCESS,
                            applicationId: arguments[0],
                            entitlements: []
                        })
                    })
                })
                return new Promise((res) => (resolve = res))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const giftModule1 = BDModules.get(e => e.fetchGiftableEntitlements)[0]
        if(giftModule1){
            const fetchGiftableEntitlements = giftModule1.fetchGiftableEntitlements
            giftModule1.fetchGiftableEntitlements = function(){
                if(!isBot)return fetchGiftableEntitlements.call(this, ...arguments)
                dispatcher.dispatch({
                    type: constants.ActionTypes.ENTITLEMENTS_GIFTABLE_FETCH
                })
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.ENTITLEMENTS_GIFTABLE_FETCH_SUCCESS,
                        entitlements: []
                    })
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const libraryModule = BDModules.get(e => e.fetchLibrary)[0]
        if(libraryModule){
            const fetchLibrary = libraryModule.fetchLibrary
            libraryModule.fetchLibrary = function(){
                if(!isBot)return fetchLibrary.call(this, ...arguments)
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.LIBRARY_FETCH_SUCCESS,
                        libraryApplications: []
                    })
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const hypesquadModule = BDModules.get(e => e.default && e.default.joinHypeSquadOnline)[0]
        if(hypesquadModule){
            const joinHypeSquadOnline = hypesquadModule.default.joinHypeSquadOnline
            hypesquadModule.default.joinHypeSquadOnline = function(){
                if(!isBot)return joinHypeSquadOnline.call(this, ...arguments)
                return Promise.reject(new Error("MemeitizerCord bot emulation cannot join hypesquad."))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const HouseSelectionModal = BDModules.get(e => e.default && e.default.displayName === "HouseSelectionModal")[0]
        const RadioGroup = BDModules.get(e => e.default && e.default.displayName === "RadioGroup")[0]

        if(HouseSelectionModal && RadioGroup){
            const defaultFunc = HouseSelectionModal.default
            HouseSelectionModal.default = function(){
                let returnValue = new defaultFunc(...arguments)

                let hypesquadValue = getCurrentHypesquad() || "3"
                const renderHeaderCopy = returnValue.renderHeaderCopy
                returnValue.renderHeaderCopy = function(){
                    return "Hypesquad"
                }
                const renderPrimaryAction = returnValue.renderPrimaryAction
                returnValue.renderPrimaryAction = function(){
                    const renderValue = renderPrimaryAction.call(returnValue, ...arguments)
                    
                    if(!returnValue.state.hasSubmittedHouse){
                        renderValue.props.children = "Submit"
                    }else{
                        renderValue.props.children = "Close"
                    }
                    if(!isBot){
                        renderValue.props.disabled = false
                    }else{
                        renderValue.props.disabled = true
                    }
                    const onClick = renderValue.props.onClick
                    renderValue.props.onClick = (ev) => {
                        if(!returnValue.state.hasSubmittedHouse){
                            returnValue.handleSubmitButtonClick.call(returnValue, ...arguments)
                        }else{
                            onClick.call(this, ...arguments)
                        }
                    }
                    return renderValue
                }
                const getSelectedHouseID = returnValue.getSelectedHouseID
                returnValue.getSelectedHouseID = function(){
                    return "HOUSE_"+hypesquadValue
                }
                const renderContent = returnValue.renderContent
                returnValue.renderContent = function(){
                    if(!isBot){
                        if(this.state.hasSubmittedHouse)return this.renderQuizResult();
    
                        let component = React.createElement(class RadioContainer extends React.PureComponent {
                            constructor(props){
                                super(props)
                            }
    
                            render(){
                                return React.createElement("div", {
                                    style: {
                                        margin: "0 auto",
                                        width: "75%"
                                    }
                                }, React.createElement(RadioGroup.default, {
                                    disabled: false,
                                    value: hypesquadValue,
                                    options: [
                                        {
                                            value: "1",
                                            name: "Bravery",
                                            desc: "The Bravery house"
                                        },
                                        {
                                            value: "2",
                                            name: "Brillance",
                                            desc: "The Brillance house"
                                        },
                                        {
                                            value: "3",
                                            name: "Balance",
                                            desc: "The Balance house"
                                        }
                                    ],
                                    onChange: (ev) => {
                                        hypesquadValue = ev.value
                                        this.forceUpdate()
                                    }
                                }))
                            }
                        }, {})
                        return component
                    }else{
                        let component = React.createElement(class BotWarning extends React.PureComponent {
                            constructor(props){
                                super(props)
                            }
    
                            render(){
                                return React.createElement("div", {
                                    style: {
                                        margin: "0 auto",
                                        width: "75%"
                                    }
                                }, [
                                    React.createElement("h2", {
                                        style: {
                                            color: "var(--text-normal)"
                                        }
                                    }, "Bots cannot use Hypesquad.")
                                ])
                            }
                        }, {})
                        return component
                    }
                }
                return returnValue
            }
        }else{
            logger.warn(new Error("Couldn't find module here"), HouseSelectionModal, RadioGroup)
        }
        const mentionModule = BDModules.get(e => e.default && e.default.fetchRecentMentions)[0]
        if(mentionModule){
            const fetchRecentMentions = mentionModule.default.fetchRecentMentions
            mentionModule.default.fetchRecentMentions = function(e, t, n, i, s){
                if(!isBot)return fetchRecentMentions.call(this, ...arguments)
                if(!n)n = null
                dispatcher.dirtyDispatch({
                    type: constants.ActionTypes.LOAD_RECENT_MENTIONS,
                    guildId: n
                })
                setImmediate(() => {
                    dispatcher.dispatch({
                        type: constants.ActionTypes.LOAD_RECENT_MENTIONS_SUCCESS,
                        messages: [],
                        isAfter: null != e,
                        hasMoreAfter: false
                    })
                })
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const templateModule = BDModules.get(e => e.default && e.default.loadTemplatesForGuild)[0]
        if(templateModule){
            const loadTemplatesForGuild = templateModule.default.loadTemplatesForGuild
            templateModule.default.loadTemplatesForGuild = function(){
                if(!isBot)return loadTemplatesForGuild.call(this, ...arguments)
                return Promise.reject(new Error("MemeitizerCord bot emulation cannot use Guild Templates"))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const searchModule = BDModules.get(e => e.default && e.default.prototype && e.default.prototype.retryLater)[0]
        if(searchModule){
            const fetch = searchModule.default.prototype.fetch
            searchModule.default.prototype.fetch = function(e, t, n){
                if(!isBot)return fetch.call(this, ...arguments)
                n(new Error("MemeitizerCord bot emulation cannot search in guild."))
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
        const inviteModule = BDModules.get(e => e.default && e.default.acceptInvite)[0]
        if(inviteModule){
            const acceptInvite = inviteModule.default.acceptInvite
            inviteModule.default.acceptInvite = function(code, location, extraOptions){
                if(!isBot)return acceptInvite.call(this, ...arguments)
                dispatcher.dispatch({
                    type: "INVITE_ACCEPT_FAILURE",
                    code
                })
                Utils.showToast("MemeitizerCord Bot Emulation cannot join guilds.", {type: "error"})
                return Promise.reject("MemeitizerCord Bot Emulation cannot join guilds.")
            }
        }else{
            logger.warn(new Error("Couldn't find module here"))
        }
    })().catch(console.error.bind(console, `%c[Error Bot shit]`, "color:red"))

    Utils.monkeyPatch(await ensureExported(e => e.default && e.default.displayName == "AuthBox"), "default", {after: (data) => {
        const children = Utils.getNestedProp(data.returnValue, "props.children.props.children.props.children")
        children.push(React.createElement(require("./tokenLogin").default, {}))
    }})
    let [
        authBoxExpanded
    ] = [
        BDModules.get(e => e.authBoxExpanded && typeof e.authBoxExpanded === "string")[0]
    ]
    DOMTools.addStyle("tokenLoginPatch", `.${authBoxExpanded ? Utils.removeDa(authBoxExpanded.authBoxExpanded) : "authBoxExpanded-2jqaBe"} {
        width: 900px;
}`)

    await ensureGuildClasses()
    BetterDiscord.init()

    events.emit("ready")
}

function installReactDevtools(){
    let reactDevToolsPath = "";
    const extensionId = "fmkadmapgofadopljbjfkapdkoienihi"
    if (process.platform === "win32") reactDevToolsPath = path.resolve(process.env.LOCALAPPDATA, "Google/Chrome/User Data");
    else if (process.platform === "linux") reactDevToolsPath = path.resolve(process.env.HOME, ".config/google-chrome");
    else if (process.platform === "darwin") reactDevToolsPath = path.resolve(process.env.HOME, "Library/Application Support/Google/Chrome");
    else reactDevToolsPath = path.resolve(process.env.HOME, ".config/chromium");
    reactDevToolsPath = path.join(reactDevToolsPath, "Default", "Extensions", extensionId)
    if (fs.existsSync(reactDevToolsPath)) {
        const versions = fs.readdirSync(reactDevToolsPath);
        reactDevToolsPath = path.resolve(reactDevToolsPath, versions[versions.length - 1]);
    }
    if(fs.existsSync(reactDevToolsPath)){
        ipcRenderer.on("MEMEITIZERCORD_DEVTOOLS_OPEN", devToolsListener)
        if (electron.ipcRenderer.sendSync("MEMEITIZERCORD_GET_IS_DEVTOOLS_OPEN")) devToolsListener();

        function devToolsListener(){
            logger.log(`Installing React Devtools`)
            ipcRenderer.sendSync("MEMEITIZERCORD_REMOVE_DEVTOOLS_EXTENSION", extensionId)
            const didInstall = ipcRenderer.sendSync("MEMEITIZERCORD_ADD_DEVTOOLS_EXTENSION", reactDevToolsPath)

            if (didInstall) logger.log("React DevTools", "Successfully installed react devtools.");
            else logger.log("React DevTools", "Couldn't find react devtools.");
        }
    }else{
        console.warn(new Error(`React Devtools could not be found.`))
    }
}

require.extensions[".css"] = (m, filename) => {
    let content = fs.readFileSync(filename, "binary")
    let style = document.createElement("style")
    style.id = Buffer.from(filename, "utf8").toString("base64")
    style.innerHTML = content
    document.head.appendChild(style)
    m.exports = {
        id: style.id,
        remove(){
            return style.remove()
        }
    }
    return m.exports
}

let zlib = require("zlib")
let tmp = require("tmp")

require.extensions[".jsbr"] = (m, filename) => {
    if(!zlib)zlib = require("zlib")
    if(!tmp)tmp = require("tmp")
    let tmpFile = tmp.fileSync()

    fs.writeFileSync(tmpFile.name+".js", zlib.brotliDecompressSync(fs.readFileSync(filename)))
    return require.extensions[".js"](m, tmpFile.name+".js")
}
require.extensions[".txt"] = (m, filename) => {
    m.exports = fs.readFileSync(filename, "utf8")
    return m.exports
}

const MemeitizerCordBDFolder = path.join(electron.ipcRenderer.sendSync("MEMEITIZERCORD_GET_PATH", "appData"), "MemeitizerCord_BD")

const BetterDiscordConfig = window.BetterDiscordConfig = {
	"branch": "MemeitizerCord",
    dataPath: MemeitizerCordBDFolder+"/",
    os: process.platform,
    latestVersion: "0.3.5",
    version: "0.3.5"
}

function ensureGuildClasses(){
    return new Promise((resolve) => {
        let classs = getGuildClasses()
        if(classs && classs.wrapper)return resolve()

        let intergay = setInterval(() => {
            classs = getGuildClasses()
            if(classs && classs.wrapper){
                clearInterval(intergay)
                resolve()
                return
            }
        }, 200);
    })
}

var ensureExported = global.ensureExported = function ensureExported(filter, maxTime = 500){
    let tried = 0
    return new Promise((resolve, reject) => {
        let mod = ModuleLoader.get(filter)[0]
        if(mod)return resolve(mod)
        tried++

        let interval = setInterval(() => {
            if(tried > maxTime){
                clearInterval(interval)
                reject(new Error("Could not find the module with the given filter."))
                return
            }
            mod = ModuleLoader.get(filter)[0]
            if(mod){
                clearInterval(interval)
                resolve(mod)
                return
            }
            tried++
        }, 100);
    })
}
let Notifications = require("./patchNotifications")
const { ipcRenderer } = require("electron")
let useDefault = electron.ipcRenderer.sendSync("MEMEITIZERCORD_GET_SETTINGS")["DEFAULT_NOTIFICATIONS"]
if(typeof useDefault !== "boolean"){
    useDefault = true
}
Notifications.useShim(!useDefault)

function getGuildClasses() {
    const guildsWrapper = ModuleLoader.get(e => e.wrapper && e.unreadMentionsBar)[0];
    const guilds = ModuleLoader.get(e => e.guildsError && e.selected)[0]
    const pill = ModuleLoader.get(e => e.blobContainer)[0]
    return Object.assign({}, guildsWrapper, guilds, pill);
}

const originalResolve = path.resolve
const originalJoin = path.join

const BetterDiscordFolder = function() {
    if (process.env.injDir) return path.resolve(process.env.injDir);
    switch (process.platform) {
        case "win32":
            return path.resolve(process.env.appdata, "BetterDiscord/");
        case "darwin":
            return path.resolve(process.env.HOME, "Library/Preferences/", "BetterDiscord/");
        default:
            return path.resolve(process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : process.env.HOME + "/.config", "BetterDiscord/");
    }
}()

path.resolve = (...args) => { // Patching BetterDiscord folder by MemeitizerCord's BetterDiscord folder
    let resp = originalResolve.call(path, ...args)
    if(resp.startsWith(BetterDiscordFolder))resp = resp.replace(BetterDiscordFolder, MemeitizerCordBDFolder)
    return resp
}
path.join = (...args) => { // Patching BetterDiscord folder by MemeitizerCord's BetterDiscord folder
    let resp = originalJoin.call(path, ...args)
    if(resp.startsWith(BetterDiscordFolder))resp = resp.replace(BetterDiscordFolder, MemeitizerCordBDFolder)
    return resp
}

path.originalResolve = originalResolve

let blacklist
function isBlacklisted(id){
    if(!blacklist)blacklist = require("./blacklist.txt").split(/[\n\r]+/g).map((line, index, lines) => {
        let id = ""
        let comment = ""
        line.split("#").forEach((idOrComment, index, array) => {
            idOrComment = idOrComment.trim()

            if(index === 0)id = idOrComment
            else if(index === 1)comment = idOrComment
        })
        return {
            id,
            comment
        }
    })
    if(blacklist.find(e => e.id === id))return true
    return false
}

const formatLogger = new Logger("RequireFormat")
function formatMinified(path){
    let result = path.replace("{min}", isPackaged ? ".min": "")
    return result
}


window.ohgodohfuck = function(){
    let style=document.createElement("style");style.innerHTML=`html:after{content:"";position:absolute;top:0;left:0 ;width:100vw;height:100vh;background-image:url("https://media.giphy.com/media/l378vg4Pm9LGnmD6M/giphy.gif");background-size:cover;background-position:center;background-color:transparent !important;opacity:0.9;mix-blend-mode:hue;z-index:999999999999;pointer-events:none}@keyframes ohgodohfuck{from{transform:rotateZ(0deg)}to{transform:rotateZ(360deg)}}#app-mount{animation:ohgodohfuck 5s infinite alternate}`;document.body.append(style);setTimeout(()=>document.body.removeChild(style),5000); 
}