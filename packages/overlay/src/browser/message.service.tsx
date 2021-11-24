import React from 'react';
import { Injectable } from '@opensumi/common-di';
import { IMessageService, AbstractMessageService, MAX_MESSAGE_LENGTH } from '../common';
import { notification, open } from '@opensumi/ide-components';
import { MessageType, uuid, localize } from '@opensumi/ide-core-common';

@Injectable()
export class MessageService extends AbstractMessageService implements IMessageService {

  // 上一个展示的文案
  private preMessage: string | React.ReactNode;

  // 当前组件展示的时间
  private showTime: number = 0;

  // 相同文案返回的间隔时间
  protected static SAME_MESSAGE_DURATION = 3000;

  // 参考 vscode message 组件消失的时间
  protected static DURATION: { [type: number]: number } = {
    [MessageType.Info]: 15000,
    [MessageType.Warning]: 18000,
    [MessageType.Error]: 20000,
  };

  /**
   *
   * @param rawMessage message
   * @param type MessageType
   * @param buttons buttons
   * @param closable true | false
   * @param from from extension
   */
  open<T = string>(rawMessage: string | React.ReactNode, type: MessageType, buttons?: string[], closable: boolean = true, from?: string): Promise<T | undefined> {
    let message = rawMessage;
    // 如果两秒内提示信息相同，则直接返回上一个提示
    if (Date.now() - this.showTime < MessageService.SAME_MESSAGE_DURATION && typeof message === 'string' && this.preMessage === message) {
      return Promise.resolve(undefined);
    }
    this.preMessage = typeof message === 'string' && message;
    this.showTime = Date.now();
    if (typeof rawMessage === 'string' && rawMessage.length > MAX_MESSAGE_LENGTH) {
      message = `${rawMessage.substr(0, MAX_MESSAGE_LENGTH)}...`;
    }
    const description = from && typeof from === 'string' ? `${localize('component.message.origin')}: ${from}` : '';
    const key = uuid();
    const promise = open<T>(message, type, closable, key, buttons, description);
    return promise || Promise.resolve(undefined);
  }

  hide(): void {
    notification.destroy();
  }
}
