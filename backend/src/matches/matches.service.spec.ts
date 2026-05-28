import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from './entities/match.entity';
import { MatchPrediction } from './entities/match-prediction.entity';
import { CreatorEvent } from './entities/creator-event.entity';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  let service: MatchesService;
  let matchRepository: jest.Mocked<Pick<Repository<Match>, 'findOne'>>;
  let matchPredictionRepository: jest.Mocked<
    Pick<Repository<MatchPrediction>, 'count' | 'findAndCount' | 'find'>
  >;

  const mockEvent = {
    id: 'event-1',
    on_chain_event_id: 1,
    title: 'Test Event',
    creator_address: 'GABC123',
    is_active: true,
    is_cancelled: false,
  } as CreatorEvent;

  const mockMatch = {
    id: 'match-1',
    on_chain_match_id: 100,
    team_a: 'Team A',
    team_b: 'Team B',
    match_time: new Date('2026-06-01'),
    result_submitted: true,
    winning_team: 'TEAM_A',
    submitted_by: 'GORACLE',
    submitted_at: new Date('2026-06-02'),
    event: mockEvent,
    created_at: new Date('2026-05-01'),
  } as Match;

  beforeEach(async () => {
    matchRepository = {
      findOne: jest.fn(),
    };

    matchPredictionRepository = {
      count: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        {
          provide: getRepositoryToken(Match),
          useValue: matchRepository,
        },
        {
          provide: getRepositoryToken(MatchPrediction),
          useValue: matchPredictionRepository,
        },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
  });

  describe('getMatchDetail', () => {
    it('should return match details with prediction distribution', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch);

      matchPredictionRepository.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(5) // TEAM_A
        .mockResolvedValueOnce(3) // TEAM_B
        .mockResolvedValueOnce(2); // DRAW

      const result = await service.getMatchDetail('match-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('match-1');
      expect(result.team_a).toBe('Team A');
      expect(result.team_b).toBe('Team B');
      expect(result.total_predictions).toBe(10);
      expect(result.prediction_distribution).toHaveLength(3);
      expect(result.prediction_distribution[0]).toEqual({
        outcome: 'TEAM_A',
        count: 5,
        percentage: '50.00',
      });
      expect(result.prediction_distribution[1]).toEqual({
        outcome: 'TEAM_B',
        count: 3,
        percentage: '30.00',
      });
      expect(result.prediction_distribution[2]).toEqual({
        outcome: 'DRAW',
        count: 2,
        percentage: '20.00',
      });
      expect(result.event_info.title).toBe('Test Event');
      expect(result.winning_team).toBe('TEAM_A');
      expect(result.submitted_by).toBe('GORACLE');
    });

    it('should return zero percentages when no predictions', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch);
      matchPredictionRepository.count
        .mockResolvedValueOnce(0) // total
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getMatchDetail('match-1');

      expect(result.total_predictions).toBe(0);
      result.prediction_distribution.forEach((d) => {
        expect(d.percentage).toBe('0.00');
      });
    });

    it('should throw NotFoundException when match does not exist', async () => {
      matchRepository.findOne.mockResolvedValue(null);

      await expect(service.getMatchDetail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMatchPredictions', () => {
    it('should return distribution without user list by default', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch);
      matchPredictionRepository.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(2);

      const result = await service.getMatchPredictions('match-1');

      expect(result.distribution).toHaveLength(3);
      expect(result.total_predictions).toBe(10);
      expect(result.users).toBeUndefined();
      expect(result.meta).toBeUndefined();
    });

    it('should include user predictions when includeUsers=true', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch);
      matchPredictionRepository.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const mockPredictions = [
        {
          id: 'pred-1',
          user: { stellar_address: 'GUSER1' },
          predicted_outcome: 'TEAM_A',
          predicted_at: new Date('2026-05-15'),
          is_correct: true,
          match: mockMatch,
        },
        {
          id: 'pred-2',
          user: { stellar_address: 'GUSER2' },
          predicted_outcome: 'TEAM_B',
          predicted_at: new Date('2026-05-16'),
          is_correct: false,
          match: mockMatch,
        },
      ];

      matchPredictionRepository.findAndCount.mockResolvedValue([
        mockPredictions as any,
        2,
      ]);

      const result = await service.getMatchPredictions('match-1', true, 1, 20);

      expect(result.users).toHaveLength(2);
      expect(result.users![0].user_address).toBe('GUSER1');
      expect(result.users![0].predicted_outcome).toBe('TEAM_A');
      expect(result.users![0].is_correct).toBe(true);
      expect(result.meta).toBeDefined();
      expect(result.meta!.total).toBe(2);
      expect(result.meta!.page).toBe(1);
    });

    it('should paginate user list correctly', async () => {
      matchRepository.findOne.mockResolvedValue(mockMatch);
      matchPredictionRepository.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(10);

      matchPredictionRepository.findAndCount.mockResolvedValue([[], 50]);

      const result = await service.getMatchPredictions('match-1', true, 2, 10);

      expect(result.meta!.page).toBe(2);
      expect(result.meta!.limit).toBe(10);
      expect(result.meta!.total).toBe(50);
      expect(result.meta!.totalPages).toBe(5);
    });

    it('should throw NotFoundException when match does not exist', async () => {
      matchRepository.findOne.mockResolvedValue(null);

      await expect(service.getMatchPredictions('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
