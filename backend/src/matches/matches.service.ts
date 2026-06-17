import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from './entities/match.entity';
import {
  MatchPrediction,
  PredictedOutcome,
} from './entities/match-prediction.entity';
import { MatchDetailDto } from './dto/match-detail.dto';
import { MatchPredictionsResponseDto } from './dto/match-predictions.dto';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,

    @InjectRepository(MatchPrediction)
    private readonly matchPredictionRepository: Repository<MatchPrediction>,
  ) {}

  async getMatchDetail(matchId: string): Promise<MatchDetailDto> {
    const numericId = Number(matchId);
    const where = Number.isFinite(numericId)
      ? [{ id: matchId }, { on_chain_match_id: numericId }]
      : [{ id: matchId }];

    const match = await this.matchRepository.findOne({
      where,
      relations: ['event'],
    });

    if (!match) {
      throw new NotFoundException(`Match with ID "${matchId}" not found`);
    }

    const totalPredictions = await this.matchPredictionRepository.count({
      where: { match: { id: match.id } },
    });

    const distribution = await this.getDistribution(match.id, totalPredictions);

    return {
      id: match.id,
      on_chain_match_id: match.on_chain_match_id,
      team_a: match.team_a,
      team_b: match.team_b,
      match_time: match.match_time,
      result_submitted: match.result_submitted,
      winning_team: match.winning_team,
      home_score: match.home_score,
      away_score: match.away_score,
      points_multiplier: match.points_multiplier,
      total_predictions: totalPredictions,
      prediction_distribution: distribution,
      event_info: {
        id: match.event.id,
        on_chain_event_id: match.event.on_chain_event_id,
        title: match.event.title,
        creator_address: match.event.creator_address,
        is_active: match.event.is_active,
        is_cancelled: match.event.is_cancelled,
      },
      submitted_by: match.submitted_by,
      submitted_at: match.submitted_at,
      created_at: match.created_at,
    };
  }

  async getMatchPredictions(
    matchId: string,
    includeUsers = false,
    page = 1,
    limit = 20,
  ): Promise<MatchPredictionsResponseDto> {
    const numericId = Number(matchId);
    const where = Number.isFinite(numericId)
      ? [{ id: matchId }, { on_chain_match_id: numericId }]
      : [{ id: matchId }];

    const match = await this.matchRepository.findOne({
      where,
    });

    if (!match) {
      throw new NotFoundException(`Match with ID "${matchId}" not found`);
    }

    const totalPredictions = await this.matchPredictionRepository.count({
      where: { match: { id: match.id } },
    });

    const distribution = await this.getDistribution(match.id, totalPredictions);

    const response: MatchPredictionsResponseDto = {
      distribution,
      total_predictions: totalPredictions,
    };

    if (includeUsers) {
      const skip = (page - 1) * limit;
      const [predictions, total] =
        await this.matchPredictionRepository.findAndCount({
          where: { match: { id: match.id } },
          relations: ['user'],
          order: { predicted_at: 'DESC' },
          skip,
          take: limit,
        });

      response.users = predictions.map((p) => ({
        id: p.id,
        user_address: p.user.stellar_address,
        predicted_outcome: p.predicted_outcome,
        predicted_at: p.predicted_at,
        is_correct: p.is_correct,
      }));

      response.meta = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return response;
  }

  private async getDistribution(matchId: string, totalPredictions: number) {
    const outcomes = ['TEAM_A', 'TEAM_B', 'DRAW'] as const;
    const distribution: Array<{
      outcome: string;
      count: number;
      percentage: string;
    }> = [];

    for (const outcome of outcomes) {
      const count = await this.matchPredictionRepository.count({
        where: {
          match: { id: matchId },
          predicted_outcome: outcome as PredictedOutcome,
        },
      });
      distribution.push({
        outcome,
        count,
        percentage:
          totalPredictions > 0
            ? ((count / totalPredictions) * 100).toFixed(2)
            : '0.00',
      });
    }

    return distribution;
  }
}
