// 发送消息时记录 composer 输入框的位置，供新挂载的用户气泡做一次 FLIP 入场动画。
let pendingRect: DOMRect | null = null;

export const setSendFlipRect = (rect: DOMRect) => {
  pendingRect = rect;
};

export const consumeSendFlipRect = () => {
  const rect = pendingRect;
  pendingRect = null;
  return rect;
};
