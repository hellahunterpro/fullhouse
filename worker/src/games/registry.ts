import type { GameModule } from './contract.js';

const games = new Map<string, GameModule>();

export function registerGame(game: GameModule): void {
  if (games.has(game.id)) {
    throw new Error(`Game "${game.id}" is already registered`);
  }
  games.set(game.id, game);
}

export function getGame(id: string): GameModule | undefined {
  return games.get(id);
}

export function listGames(): GameModule[] {
  return Array.from(games.values());
}

export function clearRegistry(): void {
  games.clear();
}
