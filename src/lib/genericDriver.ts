import EventEmitter from 'node:events';

import type { NmeaConfig, PgnDataEvent, WritePgnData } from '../types';

interface ExtendedEmitter extends EventEmitter {
    setProviderStatus: (id: string, msg: string) => void;
    setProviderError: (id: string, msg: string) => void;
}

export abstract class GenericDriver {
    protected readonly adapter: ioBroker.Adapter;

    protected readonly onData: (event: PgnDataEvent) => void;

    protected readonly app: ExtendedEmitter;

    protected  constructor(adapter: ioBroker.Adapter, settings: NmeaConfig, onData: (event: PgnDataEvent) => void) {
        this.adapter = adapter;
        this.onData = onData;
        this.app = new EventEmitter() as ExtendedEmitter;
    }

    abstract start(): void;

    abstract write(data: WritePgnData): void;

    abstract stop(): void;
}
