// isomorphic event handler
type EventHandler = (...args: any[]) => void;

class EventEmitter {
    private events: Map<string, EventHandler[]>;

    constructor() {
        this.events = new Map();
    }

    on(event: string, handler: EventHandler): void {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(handler);
    }

    off(event: string, handler: EventHandler): void {
        if (this.events.has(event)) {
            const handlers = this.events.get(event)!.filter(h => h !== handler);
            this.events.set(event, handlers);
        }
    }

    emit(event: string, ...args: any[]): void {
        if (this.events.has(event)) {
            this.events.get(event)!.forEach(handler => handler(...args));
        }
    }

    clear(event: string): void {
        if (this.events.has(event)) {
            this.events.delete(event);
        }
    }
}

export default EventEmitter;