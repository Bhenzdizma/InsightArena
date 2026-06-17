import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { CreatorEventFinalizerService } from './creator-event-finalizer.service';
import { Match } from './entities/match.entity';
import { MatchPrediction } from './entities/match-prediction.entity';
import { CreatorEvent } from './entities/creator-event.entity';
import { SorobanModule } from '../soroban/soroban.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Match, MatchPrediction, CreatorEvent]),
    ScheduleModule.forRoot(),
    SorobanModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService, CreatorEventFinalizerService],
  exports: [MatchesService, TypeOrmModule],
})
export class MatchesModule {}
