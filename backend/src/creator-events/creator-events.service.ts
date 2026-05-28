import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContractService, ContractEvent, ContractConfig, ContractParticipant } from '../contract/contract.service';
import { ListParticipantsQueryDto, ParticipantSortBy, SortOrder } from './dto/list-participants-query.dto';

export interface EnrichedEvent extends ContractEvent {
  matchCount: number;
  matchPreview: Array<{ matchId: string; homeTeam: string; awayTeam: string }>;
  winnerCount: number;
  creatorVerified: boolean;
}

export interface ParticipantWithStats {
  address: string;
  joinedAt: number;
  totalPredictions: number;
  correctPredictions: number;
  accuracyPct: number;
  rank: number;
}

export interface PaginatedParticipants {
  data: ParticipantWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CreatorEventsService {
  private readonly logger = new Logger(CreatorEventsService.name);

  constructor(private readonly contractService: ContractService) {}

  async getEventById(id: string): Promise<EnrichedEvent> {
    const event = await this.contractService.getEvent(id);

    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }

    const [matches, winners, creatorVerified] = await Promise.all([
      this.contractService.getEventMatches(id),
      this.contractService.getEventWinners(id),
      this.contractService.isVerified(event.creator),
    ]);

    return {
      ...event,
      matchCount: matches.length,
      matchPreview: matches.slice(0, 5).map((m) => ({
        matchId: m.matchId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
      })),
      winnerCount: winners.length,
      creatorVerified,
    };
  }

  async getParticipants(
    eventId: string,
    query: ListParticipantsQueryDto,
  ): Promise<PaginatedParticipants> {
    const raw: ContractParticipant[] = await this.contractService.getEventParticipants(eventId);

    const withStats: ParticipantWithStats[] = raw.map((p, i) => {
      const correct =
        typeof (p as ContractParticipant & { correctPredictions?: number }).correctPredictions === 'number'
          ? (p as ContractParticipant & { correctPredictions: number }).correctPredictions
          : 0;
      const accuracy =
        p.predictionCount > 0
          ? Math.round((correct / p.predictionCount) * 100)
          : 0;
      return {
        address: p.address,
        joinedAt: p.joinedAt,
        totalPredictions: p.predictionCount,
        correctPredictions: correct,
        accuracyPct: accuracy,
        rank: i + 1,
      };
    });

    const sorted = this.sortParticipants(withStats, query.sortBy, query.sortOrder);
    sorted.forEach((p, i) => { p.rank = i + 1; });

    const total = sorted.length;
    const start = (query.page - 1) * query.limit;
    const data = sorted.slice(start, start + query.limit);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getContractConfig(): Promise<ContractConfig> {
    const config = await this.contractService.getConfig();

    if (!config) {
      this.logger.warn('getContractConfig: contract returned null, returning defaults');
      return {
        admin: '',
        aiAgent: '',
        treasury: '',
        celoToken: '',
        creationFee: '0',
        paused: false,
      };
    }

    return config;
  }

  private sortParticipants(
    participants: ParticipantWithStats[],
    sortBy: ParticipantSortBy,
    sortOrder: SortOrder,
  ): ParticipantWithStats[] {
    const dir = sortOrder === SortOrder.Asc ? 1 : -1;

    return [...participants].sort((a, b) => {
      switch (sortBy) {
        case ParticipantSortBy.JoinedAt:
          return (a.joinedAt - b.joinedAt) * dir;
        case ParticipantSortBy.Score:
          return (a.accuracyPct - b.accuracyPct) * dir;
        case ParticipantSortBy.Address:
          return a.address.localeCompare(b.address) * dir;
        default:
          return 0;
      }
    });
  }
}
