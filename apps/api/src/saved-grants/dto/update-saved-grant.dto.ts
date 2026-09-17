import { PartialType } from '@nestjs/mapped-types';
import { CreateSavedGrantDto } from './create-saved-grant.dto';

export class UpdateSavedGrantDto extends PartialType(CreateSavedGrantDto) {}
