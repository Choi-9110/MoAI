import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IrDeck } from './entities/ir-deck.entity';
import { IrDecksController } from './ir-decks.controller';
import { IrDecksService } from './ir-decks.service';

@Module({
  imports: [TypeOrmModule.forFeature([IrDeck])],
  controllers: [IrDecksController],
  providers: [IrDecksService],
  exports: [IrDecksService],
})
export class IrDecksModule {}
