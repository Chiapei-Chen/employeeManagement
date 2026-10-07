import {
  canTransition,
  EmployeeStatus,
  validateEmployeeDates,
} from './employee.rules.js';

const { Active, OnLeave, Resigned } = EmployeeStatus;

describe('canTransition', () => {
  it.each([
    [Active, OnLeave, true],
    [Active, Resigned, true],
    [OnLeave, Active, true],
    [OnLeave, Resigned, true],
    [Resigned, Active, false],
    [Resigned, OnLeave, false],
    [Active, Active, true],
    [Resigned, Resigned, true],
  ])('%s -> %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});

describe('validateEmployeeDates', () => {
  const base = { hireDate: '2024-01-01', resignationDate: null };

  it('accepts an active employee without resignation date', () => {
    expect(validateEmployeeDates({ ...base, status: Active })).toEqual([]);
  });

  it('requires resignationDate when resigned', () => {
    const errors = validateEmployeeDates({ ...base, status: Resigned });
    expect(errors).toEqual([
      expect.objectContaining({ field: 'resignationDate' }),
    ]);
  });

  it('rejects resignationDate when not resigned', () => {
    const errors = validateEmployeeDates({
      ...base,
      status: OnLeave,
      resignationDate: '2024-06-01',
    });
    expect(errors[0].errors[0]).toMatch(/only allowed when status is resigned/);
  });

  it('rejects resignationDate earlier than hireDate', () => {
    const errors = validateEmployeeDates({
      status: Resigned,
      hireDate: '2024-01-01',
      resignationDate: '2023-12-31',
    });
    expect(errors[0].errors[0]).toMatch(/must not be earlier than hireDate/);
  });

  it('accepts resignationDate on the same day as hireDate', () => {
    expect(
      validateEmployeeDates({
        status: Resigned,
        hireDate: '2024-01-01',
        resignationDate: '2024-01-01',
      }),
    ).toEqual([]);
  });
});
