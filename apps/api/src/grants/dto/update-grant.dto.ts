import { PartialType } from '@nestjs/mapped-types';
import { CreateGrantDto } from './create-grant.dto';

export class UpdateGrantDto extends PartialType(CreateGrantDto) {}
