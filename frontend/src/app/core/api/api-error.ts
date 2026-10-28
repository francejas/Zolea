export interface ApiError {
    error: string;
    fields?: Record<string, string>;
}