import path from 'path';
import { expect, test } from '@playwright/test';

const targetModelName = 'gemini-3.1-flash-lite+openrouter';
const testMessage = '请问这是什么';

test('发送图片并询问这是什么，等待模型回复', async ({ page }) => {
  await page.goto('/app');

  const textarea = page.locator('textarea[name="message"]');
  await expect(textarea).toBeVisible();

  const modelSelector = page.getByTestId('model-selector');
  await expect(modelSelector).toBeVisible();

  const modelDialog = page.getByRole('dialog');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const modelSelectorBox = await modelSelector.boundingBox();
    if (!modelSelectorBox) {
      throw new Error('Model selector has no clickable box');
    }

    await page.mouse.click(
      modelSelectorBox.x + modelSelectorBox.width - 5,
      modelSelectorBox.y + modelSelectorBox.height / 2,
    );

    if (await modelDialog.isVisible().catch(() => false)) {
      break;
    }

    await page.waitForTimeout(500);
  }

  await expect(modelDialog).toBeVisible();

  const targetModel = modelDialog.getByRole('option', { name: targetModelName, exact: true });
  await expect(targetModel).toBeVisible();
  await targetModel.click();

  await expect(modelSelector).toHaveAttribute('title', targetModelName);
  await expect(modelSelector).toHaveAttribute('aria-label', `选择模型，当前为 ${targetModelName}`);

  const imagePath = path.join(process.cwd(), 'public', 'logo512.png');
  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/api/upload-attachment') && response.ok(),
  );
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByTestId('composer-attachment-trigger').click();
  await (await fileChooser).setFiles(imagePath);
  await uploadResponse;
  await expect(page.getByTestId('attachment-stack')).toBeVisible({ timeout: 10_000 });

  await textarea.fill(testMessage);
  console.log('提问内容:', testMessage);

  const sendButton = page.getByTestId('composer-send-button');
  await sendButton.click();

  await expect(textarea).toHaveValue('');
  await expect(page).toHaveURL(/\/app\/c\/.+/);
  await expect(sendButton).toBeVisible();

  const assistantMessage = page.locator('[data-role="assistant"]');
  await expect(assistantMessage.first()).toBeVisible({ timeout: 60_000 });
  await expect(sendButton.locator('.lucide-square')).not.toBeVisible({ timeout: 60_000 });

  const replyText = await assistantMessage.last().textContent();
  console.log('模型回复内容:', replyText);
  expect(replyText?.length).toBeGreaterThan(0);
});
