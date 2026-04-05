import { storageService, StorageService } from "./StorageService";
import type { FeedData, FeedContentItem } from "~/types";

const ARTICLE_RANKING_KEY = "@noticioso-article-ranking";
const TOP_ARTICLES_PER_FEED = 5;
const TOP_SCORE = 10;
const DEFAULT_SCORE = 1;

interface ItemWithScore {
  link: string;
  score: number;
  feedIndex: number;
  date: number;
}

export class ArticleRankingService {
  constructor(private storage: StorageService) {}

  // Asigna ranking: top 5 de cada feed = 10 puntos, resto = 1 punto
  // Orden: puntaje > feed > fecha
  // Retorna el ranking y el score para uso inmediato
  setRanking = async (
    feedsData: FeedData[],
  ): Promise<{ ranking: Record<string, number>; scoreMap: Record<string, number> }> => {
    if (!feedsData.length) {
      await this.storage.setItem(ARTICLE_RANKING_KEY, {});
      return { ranking: {}, scoreMap: {} };
    }

    const itemsWithScore: ItemWithScore[] = [];

    // Process each feed in order
    feedsData.forEach((feedData, feedIndex) => {
      const items = feedData.rss?.channel?.item ?? [];

      items.forEach((item, itemIndex) => {
        // Top 5 of each feed get higher score
        const score =
          itemIndex < TOP_ARTICLES_PER_FEED ? TOP_SCORE : DEFAULT_SCORE;

        const date = item.pubDate ? new Date(item.pubDate).getTime() : 0;

        if (item.link) {
          itemsWithScore.push({ link: item.link, score, feedIndex, date });
        }
      });
    });

    // Sort by: score (desc) > feedIndex (asc) > date (desc)
    itemsWithScore.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.feedIndex !== b.feedIndex) return a.feedIndex - b.feedIndex;
      return b.date - a.date;
    });

    // Create ranking map: link -> position (0 = best)
    const ranking: Record<string, number> = {};
    itemsWithScore.forEach((item, index) => {
      ranking[item.link] = index;
    });

    // Create score map for immediate filtering
    const scoreMap: Record<string, number> = {};
    itemsWithScore.forEach((item) => {
      scoreMap[item.link] = item.score;
    });

    await this.storage.setItem(ARTICLE_RANKING_KEY, ranking);
    return { ranking, scoreMap };
  };

  // Filtrar artículos por threshold de score
  filterByScore = (
    feedsData: FeedData[],
    scoreMap: Record<string, number>,
    threshold: number,
  ): FeedContentItem[] => {
    const result: FeedContentItem[] = [];

    feedsData.forEach((feedData) => {
      const items = feedData.rss?.channel?.item ?? [];
      items.forEach((item) => {
        if (item.link) {
          const score = scoreMap[item.link] ?? 0;
          if (score >= threshold) {
            result.push(item);
          }
        }
      });
    });

    return result;
  };

  // Obtener ranking guardado
  getRanking = async (): Promise<Record<string, number> | null> => {
    return this.storage.getItem<Record<string, number>>(ARTICLE_RANKING_KEY);
  };
}

export const articleRankingService = new ArticleRankingService(storageService);
