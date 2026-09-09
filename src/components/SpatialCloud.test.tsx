import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeConversations } from '../analysis/pipeline';
import { DEFAULT_CAMERA } from '../analysis/spatial';
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisResult, type NormalizedConversation } from '../domain/models';
import { SpatialCloud } from './SpatialCloud';

type Props = ComponentProps<typeof SpatialCloud>;
const observerDisconnect = vi.fn();

// Small synthetic conversations pass through the real analysis path. No saved
// history, service session, worker, browser profile or source request is used.
const resultFor = (userOnly = false): AnalysisResult => {
  const conversation: NormalizedConversation = {
    id: 'synthetic-spatial-interaction', provider: 'demo', title: 'Synthetic interaction fixture',
    createdAt: 1_767_225_600_000, updatedAt: 1_767_225_600_000,
    messages: Array.from({ length: userOnly ? 2 : 4 }, (_, index) => ({
      id: `message-${index}`, conversationId: 'synthetic-spatial-interaction', provider: 'demo' as const,
      role: index < 2 ? 'user' as const : 'assistant' as const,
      createdAt: 1_767_225_600_000, order: index,
      originalText: 'alpha。bravo。', analysisText: 'alpha。bravo。',
    })),
  };
  return analyzeConversations([conversation], { ...DEFAULT_ANALYSIS_SETTINGS, includePhrases: false });
};

const mount = (initial: Partial<Props> = {}) => {
  const props: Props = { result: resultFor(), camera: { ...DEFAULT_CAMERA },
    onCameraChange: vi.fn(), onSelect: vi.fn(), scopeLabel: '合成テスト', ...initial };
  return { props, ...render(<SpatialCloud {...props} />) };
};
const point = (term: string) => screen.getByRole('button', { name: new RegExp(`^${term} ·`) });
const freezeDeep = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1100);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(620);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect = observerDisconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); observerDisconnect.mockClear(); });

describe('SpatialCloud local interactions', () => {
  it('replaces stale hover metrics and label priority with the keyboard-focused term', () => {
    const { container, props } = mount();
    expect(props.result.layout.map((term) => term.term).sort()).toEqual(['alpha', 'bravo']);
    fireEvent.pointerEnter(point('alpha'));
    expect(container.querySelector('.spatial-selection__metrics strong')).toHaveTextContent('alpha');
    expect(point('alpha')).toHaveClass('is-selected');

    fireEvent.focus(point('bravo'));
    expect(point('bravo')).toHaveClass('is-selected');
    expect(point('alpha')).not.toHaveClass('is-selected');
    expect(container.querySelector('.spatial-selection__metrics strong')).toHaveTextContent('bravo');
    expect(screen.getByRole('combobox', { name: '3Dで選ぶ語' })).toHaveValue('bravo');
    expect(container.querySelector('[data-spatial-label]')).toHaveAttribute('data-spatial-label', 'bravo');

    fireEvent.keyDown(point('bravo'), { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(props.result.layout.find((term) => term.term === 'bravo'), point('bravo'));
    expect(props.onCameraChange).not.toHaveBeenCalled();
  });

  it('handles camera keys only on the SVG itself, without taking keys from terms or the selector', () => {
    const { props } = mount();
    const svg = screen.getByTestId('spatial-cloud');
    expect(fireEvent.keyDown(svg, { key: 'ArrowLeft' })).toBe(false);
    expect(props.onCameraChange).toHaveBeenLastCalledWith({ ...DEFAULT_CAMERA, yaw: DEFAULT_CAMERA.yaw - 8 });
    expect(fireEvent.keyDown(svg, { key: 'ArrowUp' })).toBe(false);
    expect(props.onCameraChange).toHaveBeenLastCalledWith({ ...DEFAULT_CAMERA, pitch: DEFAULT_CAMERA.pitch + 8 });
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(props.onCameraChange).toHaveBeenLastCalledWith(DEFAULT_CAMERA);
    expect(props.onCameraChange).toHaveBeenCalledTimes(3);

    expect(fireEvent.keyDown(point('alpha'), { key: 'ArrowLeft' })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole('combobox', { name: '3Dで選ぶ語' }), { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(svg, { key: 'PageDown' })).toBe(true);
    expect(props.onCameraChange).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(point('alpha'), { key: ' ' });
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(props.result.layout.find((term) => term.term === 'alpha'), point('alpha'));
  });

  it('does not change the camera while disabled through keyboard or explicit camera buttons', () => {
    const { props } = mount({ disabled: true });
    const svg = screen.getByTestId('spatial-cloud');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home']) fireEvent.keyDown(svg, { key });
    for (const name of ['左へ回転', '右へ回転', '上から見る', '水平に近づける', '拡大', '縮小', '視点をリセット']) {
      const button = screen.getByRole('button', { name, hidden: true });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(props.onCameraChange).not.toHaveBeenCalled();
    expect(svg).toHaveAttribute('data-yaw', String(DEFAULT_CAMERA.yaw));
    expect(svg).toHaveAttribute('data-pitch', String(DEFAULT_CAMERA.pitch));
  });

  it('keeps an empty period explicit and disables term/context selection without inventing points', () => {
    const { container, props } = mount({ result: analyzeConversations([], DEFAULT_ANALYSIS_SETTINGS) });
    expect(screen.getByText('この条件では表示できる語がありません')).toBeVisible();
    expect(container.querySelectorAll('[data-spatial-term]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-spatial-label]')).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: '3Dで選ぶ語' })).toBeDisabled();
    const select = screen.getByRole('button', { name: '選択した語の文脈を見る' });
    expect(select).toBeDisabled();
    fireEvent.click(select);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent(/NaN|Infinity/);
  });

  it('uses gray squares and explicit unavailable X for absent-role data, never shared circles', () => {
    const { container, props } = mount({ result: resultFor(true) });
    expect(props.result.layout).toHaveLength(2);
    expect(props.result.layout.every((term) => term.biasLabel === 'insufficient')).toBe(true);
    expect(container.querySelectorAll('circle.spatial-dot')).toHaveLength(0);
    expect(container.querySelectorAll('rect.spatial-dot')).toHaveLength(2);
    for (const element of container.querySelectorAll('rect.spatial-dot')) {
      expect(element).toHaveAttribute('fill', '#77747b');
      expect(element).toHaveAttribute('width', '10');
      expect(element).toHaveAttribute('height', '10');
    }
    for (const element of container.querySelectorAll('[data-spatial-term]')) expect(element).toHaveAttribute('data-world-x', '0');
    expect(container.querySelector('.spatial-selection__metrics')).toHaveTextContent('X —（比較材料不足）');
    expect(container.querySelector('.spatial-selection__metrics')).toHaveTextContent('Y 100%');
    expect(container.querySelector('.spatial-selection__metrics')).toHaveTextContent('Z 100%（1 / 1会話）');
    expect(screen.getByText('灰色の四角＝比較材料不足。X=0は共有語彙という意味ではありません。')).toBeVisible();
  });

  it('never mutates the completed source result or camera during selection, re-projection and cleanup', () => {
    const result = resultFor();
    const before = structuredClone(result);
    freezeDeep(result);
    const camera = Object.freeze({ ...DEFAULT_CAMERA });
    const { props, rerender, unmount, container } = mount({ result, camera });
    const initialWorld = [...container.querySelectorAll('[data-spatial-term]')].map((element) => ({
      term: element.getAttribute('data-spatial-term'), x: element.getAttribute('data-world-x'),
      y: element.getAttribute('data-world-y'), z: element.getAttribute('data-world-z'),
    })).sort((a, b) => (a.term ?? '').localeCompare(b.term ?? ''));
    fireEvent.pointerEnter(point('alpha'));
    fireEvent.focus(point('bravo'));
    fireEvent.change(screen.getByRole('combobox', { name: '3Dで選ぶ語' }), { target: { value: 'alpha' } });
    rerender(<SpatialCloud {...props} camera={{ yaw: 65, pitch: 60, zoom: 1.2 }} />);
    const changedWorld = [...container.querySelectorAll('[data-spatial-term]')].map((element) => ({
      term: element.getAttribute('data-spatial-term'), x: element.getAttribute('data-world-x'),
      y: element.getAttribute('data-world-y'), z: element.getAttribute('data-world-z'),
    })).sort((a, b) => (a.term ?? '').localeCompare(b.term ?? ''));
    expect(changedWorld).toEqual(initialWorld);
    expect(result).toEqual(before);
    expect(camera).toEqual(DEFAULT_CAMERA);
    unmount();
    expect(observerDisconnect).toHaveBeenCalledOnce();
  });
});
