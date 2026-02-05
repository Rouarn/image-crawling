import { message as staticMessage, notification as staticNotification, Modal as staticModal } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ModalStaticFunctions } from 'antd/es/modal/confirm';
import type { NotificationInstance } from 'antd/es/notification/interface';

class AntdGlobal {
  message: MessageInstance = staticMessage;

  notification: NotificationInstance = staticNotification;

  modal: ModalStaticFunctions = staticModal;

  setInstances(staticFunction: { message: MessageInstance; modal: Omit<ModalStaticFunctions, 'warn'>; notification: NotificationInstance }) {
    this.message = staticFunction.message;
    this.modal = staticFunction.modal as ModalStaticFunctions;
    this.notification = staticFunction.notification;
  }
}

export const antdUtils = new AntdGlobal();
