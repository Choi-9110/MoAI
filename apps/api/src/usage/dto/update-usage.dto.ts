import { PartialType } from '@nestjs/mapped-types';
import { CreateUsageDto } from './create-usage.dto';

export class UpdateUsageDto extends PartialType(CreateUsageDto) {}
