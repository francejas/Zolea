/** Las reseñas, como las piden y las devuelven `/api/bookings/{id}/review` y `/api/resorts/{id}/reviews`. */

/** Una reseña, como se ve en el balneario. */
export interface Review {
  /** «Santiago R.»: el nombre y la inicial del apellido. */
  author: string | null;
  /** De 1 a 5. */
  rating: number;
  /** Null si no dejó comentario. */
  comment: string | null;
  /** Cuándo se calificó, en hora del balneario y sin zona. */
  createdAt: string;
}

/** El pedido de calificar: las estrellas y, si quiere, un comentario de hasta 500 caracteres. */
export interface ReviewRequest {
  rating: number;
  comment: string | null;
}
