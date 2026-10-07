import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import {
  CurrentUser,
  RequirePermissions,
} from '../auth/decorators/access.decorators.js';
import { Permission } from '../auth/permissions.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { EmployeeResponseDto } from './dto/employee-response.dto.js';
import { PaginatedEmployeesDto } from './dto/paginated-employees.dto.js';
import { QueryEmployeesDto } from './dto/query-employees.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { EmployeesService } from './employees.service.js';

/**
 * Controller 只負責 HTTP 層：路由、權限宣告、參數解析。
 * 不放業務邏輯，業務邏輯都在 EmployeesService。
 */
@ApiTags('employees')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'UNAUTHORIZED：未登入或 token 無效' })
@ApiForbiddenResponse({ description: 'FORBIDDEN：權限不足' })
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /** 員工列表 */
  @Get()
  @RequirePermissions(Permission.EmployeeRead)
  @ApiOkResponse({ type: PaginatedEmployeesDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  getMany(@Query() query: QueryEmployeesDto): Promise<PaginatedEmployeesDto> {
    return this.employeesService.getMany(query);
  }

  /** 取得單一員工 */
  @Get(':id')
  @RequirePermissions(Permission.EmployeeRead)
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiNotFoundResponse({ description: 'EMPLOYEE_NOT_FOUND' })
  get(@Param('id', ParseIntPipe) id: number): Promise<EmployeeResponseDto> {
    return this.employeesService.get(id);
  }

  /** 新增員工 */
  @Post()
  @RequirePermissions(Permission.EmployeeCreate)
  @ApiCreatedResponse({ type: EmployeeResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({
    description: 'EMPLOYEE_NO_DUPLICATED / EMPLOYEE_EMAIL_DUPLICATED',
  })
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.create(dto, user);
  }

  /** 修改員工 */
  @Patch(':id')
  @RequirePermissions(Permission.EmployeeUpdate)
  @ApiOkResponse({ type: EmployeeResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  @ApiNotFoundResponse({ description: 'EMPLOYEE_NOT_FOUND' })
  @ApiConflictResponse({
    description:
      'EMPLOYEE_VERSION_CONFLICT / EMPLOYEE_EMAIL_DUPLICATED / INVALID_STATUS_TRANSITION',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EmployeeResponseDto> {
    return this.employeesService.update(id, dto, user);
  }
}
