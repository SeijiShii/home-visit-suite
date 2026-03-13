import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../contexts/I18nContext';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
  it('タイトルが表示される', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <DashboardPage />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
