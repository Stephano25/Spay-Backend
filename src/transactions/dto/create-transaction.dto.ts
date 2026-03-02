import { IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';
import { TransactionType } from '../schemas/transaction.schema';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  receiverId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}