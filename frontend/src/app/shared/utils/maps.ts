/** Donde Google Maps busca una dirección: sin clave de Google ni backend, es un enlace común. */
const MAPS_SEARCH = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * El enlace que abre Google Maps con la dirección del balneario. En la computadora abre Maps en la
 * pestaña que se pida; en el celular, la aplicación de Maps. La dirección se codifica para URL
 * (comas, tildes, espacios), así que se pasa tal cual está escrita: «Av. Peralta Ramos 4800, Mar del Plata».
 */
export function mapsUrl(location: string): string {
  return MAPS_SEARCH + encodeURIComponent(location.trim());
}

/** Lo que lee el lector de pantalla: dice adónde lleva y que se abre en otra pestaña. */
export function directionsLabel(resortName: string): string {
  return `Cómo llegar a ${resortName}, en Google Maps (se abre en otra pestaña)`;
}
