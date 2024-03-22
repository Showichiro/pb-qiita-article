/**
 * Nullable type
 * @param T - Type to make nullable
 * @returns Nullable type of T
 * @example
 * type NullablePerson = Nullable<Person>;
 */
export type Nullable<T> = { [P in keyof T]: T[P] | null };
