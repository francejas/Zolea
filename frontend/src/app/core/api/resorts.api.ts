import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { environment } from "../../../environments/environment";
import { Observable } from "rxjs";
import { Resort } from "./resort.models";

@Injectable({
    providedIn: 'root'
})
export class ResortsApi {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apiUrl}/api/resorts`;

    list (): Observable<Resort[]> {
        return this.http.get<Resort[]>(this.apiUrl);
    }

    get(id: string): Observable<Resort> {
        return this.http.get<Resort>(`${this.apiUrl}/${id}`);
    }
}