import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { MatchesService } from './matches.service';
import { MatchDetailDto } from './dto/match-detail.dto';
import { MatchPredictionsResponseDto } from './dto/match-predictions.dto';

@ApiTags('Matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: 'Get match details by ID or on-chain ID' })
  @ApiResponse({
    status: 200,
    description: 'Match details with prediction distribution',
    type: MatchDetailDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatchById(@Param('id') id: string): Promise<MatchDetailDto> {
    return this.matchesService.getMatchDetail(id);
  }

  @Get(':id/predictions')
  @Public()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({
    summary: 'Get predictions for a match with distribution statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Prediction distribution and optional user list',
    type: MatchPredictionsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Match not found' })
  @ApiQuery({
    name: 'includeUsers',
    required: false,
    type: Boolean,
    description: 'Include user predictions list',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number for user list',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  async getMatchPredictions(
    @Param('id') id: string,
    @Query('includeUsers') includeUsers?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<MatchPredictionsResponseDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 50) : 20;
    return this.matchesService.getMatchPredictions(
      id,
      includeUsers === 'true',
      pageNum,
      limitNum,
    );
  }
}
