import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTest } from '@/test/render';
import { currentModelId, setCurrentModelId } from '@/frontend/conversations/session/chat-selection';
import { DEFAULT_MODEL_ID } from '@/shared/chat/model-catalog';
import { ModelSettings } from './ModelSettings';

const router = vi.hoisted(() => ({
  availableModels: [
    { id: 'claudeOpus46Ikun', name: 'Opus 4.6' },
    { id: 'ikun:gpt-5.4', name: 'GPT 5.4' },
    { id: 'gemini-aistudio:gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ],
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({ availableModels: router.availableModels }),
  }),
}));

afterEach(() => {
  setCurrentModelId(DEFAULT_MODEL_ID);
});

describe('ModelSettings', () => {
  it('shows the current model and selects a filtered model', () => {
    renderTest(() => <ModelSettings />);

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    expect(screen.getByText(DEFAULT_MODEL_ID)).toBeDefined();

    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'GPT 5.4' } });

    expect(screen.queryByRole('button', { name: 'Opus 4.6' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gemini 2.5 Pro' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'GPT 5.4' }));

    expect(currentModelId()).toBe('ikun:gpt-5.4');
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Choose model, current model is GPT 5.4' }),
    ).toBeDefined();
  });

  it('keeps an unavailable model visible instead of falling back', () => {
    setCurrentModelId('retired:model');
    renderTest(() => <ModelSettings />);

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is unavailable: retired:model',
    });
    expect(screen.getByText('Current model unavailable')).toBeDefined();
    expect(screen.getByText('retired:model')).toBeDefined();

    fireEvent.click(trigger);
    fireEvent.input(screen.getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('No matching models.')).toBeDefined();
    expect(currentModelId()).toBe('retired:model');
  });

  it('selects the highlighted search result with Enter', () => {
    renderTest(() => <ModelSettings />);

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'gemini-aistudio' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(currentModelId()).toBe('gemini-aistudio:gemini-2.5-pro');
    expect(trigger).toBe(document.activeElement);
    expect(screen.queryByRole('textbox', { name: 'Search models' })).toBeNull();
  });

  it('moves through the unfiltered model list with arrow keys', () => {
    renderTest(() => <ModelSettings />);

    const trigger = screen.getByRole('button', {
      name: 'Choose model, current model is Opus 4.6',
    });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(currentModelId()).toBe('ikun:gpt-5.4');
    expect(trigger).toBe(document.activeElement);
  });

  it('leaves Home and End available for editing the search text', () => {
    renderTest(() => <ModelSettings />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose model, current model is Opus 4.6' }),
    );
    const search = screen.getByRole('textbox', { name: 'Search models' });
    fireEvent.input(search, { target: { value: 'gpt' } });

    expect(fireEvent.keyDown(search, { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(search, { key: 'End' })).toBe(true);
    expect(currentModelId()).toBe(DEFAULT_MODEL_ID);
  });
});
