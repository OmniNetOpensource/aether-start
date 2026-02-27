import { test, expect } from '@playwright/test';
import path from 'path';

test('发送图片和文字并等待模型回复', async ({ page }) => {
  // 1. 访问应用页面
  await page.goto('/app');

  // 等待页面加载完成，确保输入框可见
  const textarea = page.locator('textarea[name="message"]');
  await expect(textarea).toBeVisible();

  // 2. 选择角色 (如果有角色选择器且未选择)
  // 尝试点击角色选择器，如果当前显示的是"角色"说明还没选
  const roleSelectorBtn = page.locator('button:has(svg.lucide-chevron-down)');
  const roleText = await roleSelectorBtn.textContent();
  
  if (roleText?.includes('角色') || roleText?.trim() === '') {
    await roleSelectorBtn.click();
    // 等待下拉列表出现并点击第一个角色
    const firstRole = page.locator('[role="dialog"] button').first();
    await expect(firstRole).toBeVisible();
    await firstRole.click();
  }

  // 3. 上传图片
  // 找到隐藏的 file input
  const fileInput = page.locator('input[type="file"]');
  // 使用项目中现有的图片作为测试附件
  const imagePath = path.join(process.cwd(), 'public', 'icon-192.png');
  await fileInput.setInputFiles(imagePath);

  // 等待图片上传完成 (通过检查附件预览区域是否出现)
  // PeekingAttachments 组件会渲染一个包含 img 的区域
  const attachmentPreview = page.locator('img[alt="attachment preview"]').first();
  await expect(attachmentPreview).toBeVisible({ timeout: 10000 });

  // 4. 输入文字
  const testMessage = '这是一段测试文字，请回复收到。';
  await textarea.fill(testMessage);

  // 5. 点击发送按钮
  const sendButton = page.locator('button[type="submit"], button:has(svg.lucide-arrow-up)');
  await sendButton.click();

  // 6. 检查发送后的状态
  // 输入框应该被清空
  await expect(textarea).toHaveValue('');
  // 附件预览应该消失
  await expect(attachmentPreview).not.toBeVisible();

  // 7. 等待模型回复
  // 找到所有的消息内容区域
  // 假设用户的消息和模型的回复都会渲染在页面上
  // 我们等待最后一个包含内容的元素出现，并且等待生成完成（发送按钮恢复原状）
  
  // 等待停止生成的按钮（方形图标）出现，表示正在生成
  const stopButton = page.locator('button:has(svg.lucide-square)');
  await expect(stopButton).toBeVisible();

  // 等待停止生成的按钮消失，表示生成完成
  await expect(stopButton).not.toBeVisible({ timeout: 60000 }); // 给模型 60 秒的时间回复

  // 验证页面上出现了模型的回复内容
  // 找到所有的消息块，最后一个应该是模型的回复
  const messages = page.locator('.prose, [data-message-role="assistant"]');
  const count = await messages.count();
  expect(count).toBeGreaterThan(0);
  
  // 打印最后一条消息的文本，方便调试确认
  const lastMessageText = await messages.last().textContent();
  console.log('模型回复内容:', lastMessageText);
  expect(lastMessageText?.length).toBeGreaterThan(0);
});
