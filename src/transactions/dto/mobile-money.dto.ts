import { IsString, IsNumber, Min, Max, Matches } from 'class-validator';

export class MobileMoneyDto {
  @IsString()
  @Matches(/^(airtel|orange|mvola)$/, { message: 'Opérateur invalide' })
  operator: string;

  @IsString()
  @Matches(/^[0-9]{9,10}$/, { message: 'Numéro de téléphone invalide (9-10 chiffres)' })
  phoneNumber: string;

  @IsNumber()
  @Min(100, { message: 'Montant minimum: 100 Ar' })
  @Max(100000000, { message: 'Montant maximum: 100 000 000 Ar' })
  amount: number;
}