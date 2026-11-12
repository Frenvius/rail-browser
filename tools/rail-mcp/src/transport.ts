import type {Space} from '~/spaces';
import {failure, type RailTools, type Tool, type ToolArgs} from '~/tools';
import type {ToolResult} from '~/upstream';

type RequestId = number|string;

export interface Message {
  jsonrpc: '2.0';
  id?: RequestId;
  method?: string;
  params?: {name?: string, arguments?: ToolArgs, [key: string]: unknown};
  result?: Partial<ToolResult>&{tools?: Tool[], [key: string]: unknown};
  error?: unknown;
}

export interface Transport {
  onmessage?: (message: Message, extra?: unknown) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  start(): Promise<void>;
  send(message: Message, options?: unknown): Promise<void>;
  close(): Promise<void>;
}

export class RailTransport implements Transport {
  onmessage?: Transport['onmessage'];
  onclose?: Transport['onclose'];
  onerror?: Transport['onerror'];

  private readonly toolLists = new Set<RequestId>();
  private readonly pageFilters = new Map<RequestId, Space>();

  constructor(
      private readonly inner: Transport, private readonly tools: RailTools) {}

  start(): Promise<void> {
    this.inner.onmessage = (message, extra) => {
      void this.receive(message, extra);
    };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = error => this.onerror?.(error);
    return this.inner.start();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  async send(message: Message, options?: unknown): Promise<void> {
    await this.inner.send(await this.rewrite(message), options);
  }

  private async receive(message: Message, extra: unknown) {
    const {id, method, params} = message;
    if (id === undefined || method !== 'tools/call') {
      if (id !== undefined && method === 'tools/list') {
        this.toolLists.add(id);
      }
      this.onmessage?.(message, extra);
      return;
    }
    try {
      const route =
          await this.tools.route(params?.name ?? '', params?.arguments ?? {});
      if ('answer' in route) {
        await this.reply(id, await this.tools.decorate(route.answer));
        return;
      }
      if (route.only) {
        this.pageFilters.set(id, route.only);
      }
      this.onmessage?.(
          {...message, params: {...params, arguments: route.forward}}, extra);
    } catch (error) {
      await this.reply(id, failure(error));
    }
  }

  private reply(id: RequestId, result: ToolResult): Promise<void> {
    return this.inner.send({jsonrpc: '2.0', id, result: {...result}});
  }

  private async rewrite(message: Message): Promise<Message> {
    const {id, method, result} = message;
    if (id === undefined || method !== undefined) {
      return message;
    }
    const listsTools = this.toolLists.delete(id);
    const only = this.pageFilters.get(id);
    this.pageFilters.delete(id);
    if (!result) {
      return message;
    }
    if (listsTools && result.tools) {
      const tools = this.tools.extend(result.tools);
      return {...message, result: {...result, tools}};
    }
    const {content} = result;
    if (!content) {
      return message;
    }
    const decorated = await this.tools.decorate({...result, content}, only);
    return {...message, result: {...decorated}};
  }
}
