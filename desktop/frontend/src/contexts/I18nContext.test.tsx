import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { I18nProvider, useI18n } from './I18nContext';
import { setLocale } from '../i18n/i18n-util';

function TestConsumer() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="title">{t.dashboard.title}</span>
      <button onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}>toggle</button>
    </div>
  );
}

describe('I18nContext', () => {
  afterEach(() => {
    setLocale('ja');
  });

  it('デフォルトロケールはja', () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('ja');
  });

  it('ロケール切替で翻訳が変わる', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>,
    );

    const jaTitle = screen.getByTestId('title').textContent;
    await user.click(screen.getByText('toggle'));
    const enTitle = screen.getByTestId('title').textContent;

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(jaTitle).not.toBe(enTitle);
  });
});
