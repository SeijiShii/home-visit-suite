import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../contexts/I18nContext';
import { Layout } from './Layout';

function renderLayout(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <I18nProvider>
        <Layout />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('6つのナビゲーションリンクが表示される', () => {
    renderLayout();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
  });

  it('ダッシュボードリンクがアクティブ', () => {
    renderLayout('/');
    const links = screen.getAllByRole('link');
    expect(links[0].className).toContain('active');
  });

  it('サイドバー折りたたみが動作する', async () => {
    const user = userEvent.setup();
    renderLayout();

    const sidebar = document.querySelector('.sidebar');
    expect(sidebar?.className).not.toContain('collapsed');

    await user.click(screen.getByTitle('Toggle sidebar'));
    expect(sidebar?.className).toContain('collapsed');
  });

  it('ロケール切替ボタンが表示される', () => {
    renderLayout();
    expect(screen.getByText('EN')).toBeInTheDocument();
  });
});
