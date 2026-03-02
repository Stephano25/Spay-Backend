import { IsNumber, IsString, Min, IsOptional } from 'class-validator';

export class SendMoneyDto {
  @IsString()
  receiverId: string;

  @IsNumber()
  @Min(100)
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;
}