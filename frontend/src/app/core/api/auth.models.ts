export type Role = 'USER' | 'ADMIN'

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    clientId: number;
    role: Role;
}

export interface Me {
    idClient: number;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    idManagedResort: number | null;
}