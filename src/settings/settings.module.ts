// src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Setting, SettingSchema } from './schemas/setting.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Setting.name, schema: SettingSchema }
    ]),
  ],
  exports: [
    MongooseModule, // Exporter pour que d'autres modules puissent l'utiliser
  ],
  providers: [],
})
export class SettingsModule {}