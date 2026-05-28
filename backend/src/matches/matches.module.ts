import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { Match } from './entities/match.entity';
import { MatchPrediction } from './entities/match-prediction.entity';
import { CreatorEvent } from './entities/creator-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Match, MatchPrediction, CreatorEvent])],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService, TypeOrmModule],
})
export class MatchesModule {}
