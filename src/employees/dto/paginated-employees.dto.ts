import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';
import { EmployeeResponseDto } from './employee-response.dto.js';

export class PaginatedEmployeesDto {
  items: EmployeeResponseDto[];
  meta: PaginationMetaDto;
}
