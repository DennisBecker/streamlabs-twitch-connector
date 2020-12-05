import SockJS from 'sockjs-client';

class StreamlabsClient {

    connectionStatus = 'disconnected';
    token: string|undefined;
    url: string = ''; //`http =//${location.hostname} =${PORT}/api`;
    scenes: Object[] = [];
    audioSources: any;
    sceneItems: any;
    nextRequestId: number = 1;
    requests: Object[] = [];
    subscriptions: any[] = [];
    socket: any = null;
    page:string = 'scenes';
    requestString: string = '';
    topPanelIsVisible = true;

    constructor(token: string|undefined, port: any) {
        this.token = token;
        this.url = `http://127.0.0.1:${port}/api`;
    }
    
    connect() {
        if (this.connectionStatus !== 'disconnected') return;
        this.connectionStatus = 'pending';
        this.socket = new SockJS(this.url);

        this.socket.onopen = () => {
            console.log('open');
            // send token for auth
            this.request('TcpServerService', 'auth', this.token).then(() => {
                this.onConnectionHandler();
            }).catch((e: any) => {
                console.log(e.message);
            })
        }

        this.socket.onmessage = (e: SockJS.MessageEvent) => {
            this.onMessageHandler(e.data);
            this.logMessage(e.data.toString(), 'response');
        }


        this.socket.onclose = (e: SockJS.CloseEvent) => {
            this.connectionStatus = 'disconnected';
            console.log('disconnected: ' + e.reason);
            console.log('close', e);
        }
    }

    simpleRequest(resourceId: string, methodName: string): any {
        let id = this.nextRequestId++;
        let requestBody = {
            jsonrpc: '2.0',
            id,
            method: methodName,
            params: { resource: resourceId }
        }

        return this.sendMessage(requestBody);
    }

    request(resourceId: string, methodName: string, ...args: any):any {
        let id = this.nextRequestId++;
        let requestBody = {
            jsonrpc: '2.0',
            id,
            method: methodName,
            params: { resource: resourceId, args }
        }

        return this.sendMessage(requestBody);
    }
    
    
    onConnectionHandler() {
        this.connectionStatus = 'connected';

        this.simpleRequest('ScenesService', 'getScenes').then((scenes: any) => {
            scenes.forEach((scene: any) => this.addScene(scene));
        });

        this.simpleRequest('ScenesService', 'activeSceneId').then((id: any) => {
            const scene: any = this.scenes.find((scene: any) => scene.id === id);
            scene.isActive = true;
            this.onSceneSwitchedHandler(scene);
        });

        this.subscribe('ScenesService', 'sceneSwitched', (activeScene: any) => {
            this.onSceneSwitchedHandler(activeScene);
        });

        this.subscribe('ScenesService', 'sceneAdded', (scene: any) => {
            this.addScene(scene);
        });

        this.subscribe('ScenesService', 'sceneRemoved', (scene: any) => {
            this.removeScene(scene.id);
        });

        this.subscribe('SourcesService', 'sourceUpdated', (source: any) => {
            this.onSourceUpdatedHandler(source);
        });

        this.subscribe('ScenesService', 'itemAdded', (sceneItem: any) => {
            this.onSceneItemAdded(sceneItem);
        });

        this.subscribe('ScenesService', 'itemUpdated', (sceneItem: any) => {
            this.onSceneItemUpdateHandler(sceneItem);
        });
    }
    
    sendMessage(message: string|Object): any {
        let requestBody: any = {};
        if (typeof message === 'string') {
            try {
             requestBody = JSON.parse(message);
            } catch (e) {
                console.log('Invalid JSON');
            return;
            }
        } else {
            requestBody = message;
        }

        if (!requestBody.id) {
            console.log('id is required');
            return;
        }

        this.logMessage(requestBody, 'request');

        return new Promise((resolve, reject) => {
            this.requests
            const newRequest: Object = {
                body: requestBody,
                resolve,
                reject,
                completed: false
            }

            this.requests[requestBody.id] = newRequest;
            this.socket.send(JSON.stringify(requestBody));
        });
    }
    
    
    onMessageHandler(data: string) {
        let message: any = JSON.parse(data);
        let request: any = this.requests[message.id];

        if (request) {
            if (message.error) {
            request.reject(message.error);
            } else {
            request.resolve(message.result);
            }
            delete this.requests[message.id];
        }

        const result = message.result;
        if (!result) return;

        if (result._type === 'EVENT' && result.emitter === 'STREAM') {
            this.subscriptions[message.result.resourceId](result.data);
        }
    }
    
    
    subscribe(resourceId: string, channelName: string, cb: CallableFunction) {
        this.simpleRequest(resourceId, channelName).then((subscriptionInfo: any) => {
            this.subscriptions[subscriptionInfo.resourceId] = cb;
        });
    }
    
    
    addScene(scene: Object) {
        this.scenes.push({...scene, isActive: false });
    }
    
    removeScene(sceneId: string) {
        this.scenes.splice(this.scenes.findIndex((scene: any) => scene.id == sceneId), 1);
    }
    
    switchScene(sceneId: string) {
        this.request('ScenesService', 'makeSceneActive', sceneId);
    }
    
    setMuted(sourceId: string, isMuted: boolean) {
        this.request('SourcesService', 'setMuted', sourceId, isMuted);
    }
    
    toggleSceneItem(sceneItem: any) {
        this.request(sceneItem.resourceId, 'setVisibility', !sceneItem.visible);
    }
    
    onSceneSwitchedHandler(activeSceneModel: any) {
        let activeScene: any = null;
        this.scenes.forEach((scene: any) => {
            scene.isActive = scene.id === activeSceneModel.id;
            if (scene.isActive) activeScene = scene;
        });
        this.request('AudioService', 'getSourcesForCurrentScene', []).then((sources: any) => this.audioSources = sources);
        this.request(activeScene.resourceId, 'getItems').then((items: any) => this.sceneItems = items);
    }

    onSourceUpdatedHandler(sourceModel: any) {
        let source: any = this.audioSources.find((source: any) => source.sourceId === sourceModel.sourceId);
        source.muted = sourceModel.muted;
    }
    
    onSceneItemUpdateHandler(sceneItemModel: any) {
        let sceneItem = this.sceneItems.find((sceneItem: any) => sceneItem.sceneItemId === sceneItemModel.sceneItemId);
        Object.assign(sceneItem, sceneItemModel);
    }
    
    onSceneItemAdded(sceneItemModel: any) {
        this.sceneItems.push(sceneItemModel);
    }
    
    resetRequestString() {
        this.requestString = JSON.stringify({
            jsonrpc: '2.0',
            id: this.nextRequestId++,
            method: 'getSources',
            params: { resource: 'SourcesService', args: [] }
        }, null, 2);
    }
    
    
    logMessage(data: string, type: string) {
        let jsonObj: Object  = (typeof data === 'string') ? JSON.parse(data) : data;
        //console.log(type, jsonObj);
    }
}

export default StreamlabsClient;