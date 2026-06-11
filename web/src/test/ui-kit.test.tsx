import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Button, Panel, StatPill, Skeleton, ScreenHeader, ToastProvider, useToast } from '../ui';

afterEach(() => cleanup());

describe('UI kit', () => {
  it('Button renders variants and blocks clicks while loading', () => {
    const { rerender } = render(<Button>Bet</Button>);
    const btn = screen.getByRole('button', { name: /Bet/ });
    expect(btn.className).toContain('ui-btn--primary');

    rerender(
      <Button variant="ghost" loading>
        Bet
      </Button>,
    );
    expect(btn.className).toContain('ui-btn--ghost');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Panel and Skeleton render', () => {
    render(
      <Panel data-testid="panel">
        <Skeleton height={20} />
      </Panel>,
    );
    expect(screen.getByTestId('panel').className).toContain('ui-panel');
  });

  it('StatPill shows the formatted value', () => {
    render(<StatPill value={12345} />);
    expect(screen.getByText((12345).toLocaleString())).toBeTruthy();
  });

  it('ScreenHeader shows back button only when onBack is given', () => {
    const { rerender } = render(<ScreenHeader title="Lobby" balance={100} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    rerender(<ScreenHeader title="Dice" balance={100} onBack={() => {}} />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('Toast queues and renders messages', async () => {
    function Demo() {
      const toast = useToast();
      return <button onClick={() => toast('Saved!', 'success')}>go</button>;
    }
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('go'));
    });
    expect(screen.getByText('Saved!')).toBeTruthy();
  });
});
