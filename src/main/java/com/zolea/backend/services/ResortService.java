package com.zolea.backend.services;

import com.zolea.backend.dtos.amenity.AmenityResponse;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import com.zolea.backend.dtos.resort.*;
import com.zolea.backend.exceptions.booking.InvalidBookingRangeException;
import com.zolea.backend.exceptions.resort.ResortInvalidRegisterException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.Guest;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.RentalUnitRepository;
import com.zolea.backend.repositories.ResortAvailability;
import com.zolea.backend.repositories.ResortRating;
import com.zolea.backend.repositories.ResortRepository;
import com.zolea.backend.repositories.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * <p><b>Transacciones:</b> la clase entera es de solo lectura y cada método que escribe lo declara.
 * Antes no había ninguna transacción declarada acá: el mapeo a DTO recorría colecciones LAZY fuera
 * de toda transacción y funcionaba únicamente porque {@code spring.jpa.open-in-view} dejaba la
 * sesión de base abierta durante toda la petición. Es decir, la transacción existía pero no la
 * había decidido nadie, y su límite lo ponía un filtro web.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ResortService {

    /** El rango más largo que aceptan las estadísticas, con los dos extremos incluidos. */
    private static final int MAX_STATS_DAYS = 366;

    private final ResortRepository resortRepository;
    private final AmenityRepository amenityRepository;
    private final ReviewRepository reviewRepository;
    private final RentalUnitRepository rentalUnitRepository;
    private final BookingRepository bookingRepository;
    private final Clock clock;

    /**
     * Los balnearios que se le muestran a un visitante.
     *
     * <p>Solo los activos. Antes devolvía todos: el campo estaba en la base y en los endpoints de
     * activar y desactivar, pero ninguna consulta lo miraba, así que desactivar un balneario no
     * hacía nada visible.
     */
    public List<ResortResponse> getAll() {
        List<Resort> resorts = resortRepository.findByIsActiveTrue();
        Map<Long, ResortRating> ratings = ratingsOf(resorts.stream().map(Resort::getIdResort).toList());
        return resorts.stream()
                .map(r -> mapToResponse(r, ratings.get(r.getIdResort())))
                .toList();
    }

    /**
     * Los balnearios de la portada, con los filtros de la búsqueda.
     *
     * <p>Sin ningún filtro responde lo mismo que {@link #getAll()}: todos los activos, tengan lugar
     * o no. Con cualquier filtro, solo los activos que tienen <b>al menos una unidad</b> no
     * bloqueada que cumpla el tipo y el precio y, si vinieron fechas, esté libre en esas fechas.
     * Cuando se buscó con fechas, cada uno trae en {@code availableUnits} cuántas cumplen.
     *
     * <p>El filtrado lo hace la base en una consulta ({@link RentalUnitRepository#countMatchingUnitsByResort});
     * acá solo se cargan los balnearios que pasaron.
     *
     * @throws InvalidBookingRangeException si viene una sola fecha, si {@code from} es posterior a
     *                                      {@code to} o si {@code from} ya pasó.
     */
    public List<ResortResponse> search(ResortSearch search) {
        validateDates(search.from(), search.to(), false);
        if (search.isEmpty()) {
            return getAll();
        }

        Map<Long, Long> unitsByResort = rentalUnitRepository.countMatchingUnitsByResort(
                        search.q() == null ? null : likePattern(search.q()),
                        search.type(),
                        search.maxPrice(),
                        search.amenityIds(),
                        search.amenityIds().size(),
                        search.from(),
                        search.to())
                .stream()
                .collect(Collectors.toMap(ResortAvailability::resortId, ResortAvailability::units));
        if (unitsByResort.isEmpty()) {
            return List.of();
        }

        List<Long> ids = unitsByResort.keySet().stream().sorted().toList();
        Map<Long, Resort> resorts = resortRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Resort::getIdResort, Function.identity()));
        Map<Long, ResortRating> ratings = ratingsOf(ids);
        return ids.stream()
                .map(id -> mapToResponse(resorts.get(id), ratings.get(id),
                        search.hasDates() ? unitsByResort.get(id) : null))
                .toList();
    }

    /**
     * Las unidades del balneario ocupadas en esas fechas: las que tienen una reserva pendiente o
     * confirmada que se pisa con ellas. El plano las marca como no disponibles, igual que a las
     * bloqueadas, en vez de dejar que la reserva falle recién al confirmarla.
     *
     * @throws InvalidBookingRangeException si falta alguna de las dos fechas, si {@code from} es
     *                                      posterior a {@code to} o si {@code from} ya pasó.
     * @throws ResortNotFoundException      si el balneario no existe.
     */
    public List<Long> getOccupiedUnitIds(Long resortId, LocalDate from, LocalDate to) {
        validateDates(from, to, true);
        if (!resortRepository.existsById(resortId)) {
            throw new ResortNotFoundException("Resort with id " + resortId + " not found");
        }
        return bookingRepository.findOccupiedUnitIds(resortId, from, to);
    }

    /**
     * Las fechas de una búsqueda: las dos o ninguna, en orden y desde hoy. Con {@code required},
     * ninguna tampoco vale.
     *
     * <p>Hoy todavía vale: es el día de quien busca lugar para ir ya. «Hoy» es el del balneario,
     * por el reloj de la aplicación, no el de la máquina.
     */
    private void validateDates(LocalDate from, LocalDate to, boolean required) {
        if (from == null && to == null && !required) {
            return;
        }
        if (from == null || to == null) {
            throw new InvalidBookingRangeException(required
                    ? "Van las dos fechas, from y to."
                    : "Van las dos fechas, from y to, o ninguna.");
        }
        if (from.isAfter(to)) {
            throw new InvalidBookingRangeException(
                    "La fecha from (" + from + ") no puede ser posterior a to (" + to + ").");
        }
        LocalDate today = LocalDate.now(clock);
        if (from.isBefore(today)) {
            throw new InvalidBookingRangeException(
                    "La fecha from (" + from + ") ya pasó: hoy es " + today + ".");
        }
    }

    /**
     * El texto de la búsqueda como patrón de {@code LIKE}: en minúsculas, entre comodines y con
     * los comodines propios escapados, así un {@code %} o un {@code _} que escribió el usuario se
     * busca tal cual en vez de coincidir con cualquier cosa.
     *
     * <p>Escapa con {@code !} y no con la barra invertida, que MySQL ya interpreta como escape
     * dentro de un texto: {@code ESCAPE '\'} ni siquiera llega a ser un texto válido.
     */
    private static String likePattern(String text) {
        String escaped = text.toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }

    /**
     * El promedio y la cantidad de reseñas de esos balnearios, en una sola consulta para todo el
     * listado. Un balneario sin reseñas no queda en el mapa.
     */
    private Map<Long, ResortRating> ratingsOf(List<Long> resortIds) {
        if (resortIds.isEmpty()) {
            return Map.of();
        }
        return reviewRepository.findRatingsByResort(resortIds).stream()
                .collect(Collectors.toMap(ResortRating::resortId, Function.identity()));
    }

    /**
     * La ficha pública de un balneario. Uno desactivado responde como si no existiera (RF30): no se
     * ofrece. Su administrador lo sigue viendo con {@link #getMyResort}.
     */
    public ResortResponse getResortById(Long id) {
        Resort resort = resortRepository.findById(id)
                .filter(Resort::isActive)
                .orElseThrow(() -> new ResortNotFoundException("Resort with id " + id + " not found"));

        return mapToResponse(resort);
    }

    @Transactional
    public ResortResponse registerResort(ResortRequest request) {
        if (resortRepository.findByName(request.name()).isPresent()) {
            throw new ResortInvalidRegisterException("Resort with name " + request.name() + " already exists");
        }

        Resort resort = new Resort();
        resort.setName(request.name());
        resort.setLocation(request.location());
        resort.setAdminEmail(request.adminEmail());
        resort.setCoverPhotoUrl(request.coverPhotoUrl());
        resort.setDescription(request.description());
        resort.setActive(true);

        // Buscar y asignar amenities si enviaron la lista de IDs (notar que usamos request.amenityIds())
        if (request.amenityIds() != null && !request.amenityIds().isEmpty()) {
            List<Amenity> amenities = amenityRepository.findAllById(request.amenityIds());
            resort.setAmenities(amenities);
        }

        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse updateResort(Long resortId, ResortRequest request) {
        Resort resort = resortRepository.findById(resortId)
                .orElseThrow(() -> new ResortNotFoundException("Resort with id " + resortId + " not found"));

        applyChanges(resort, request);
        return mapToResponse(resortRepository.save(resort));
    }

    /**
     * Copia al balneario solo los campos que vinieron en el pedido.
     *
     * <p>Antes se asignaban todos sin mirar, así que un formulario que no mandara la foto o la
     * descripción las dejaba en {@code null} y la portada pública se quedaba sin imagen. Un
     * {@code PUT} incompleto no debería borrar lo que no menciona.
     */
    private void applyChanges(Resort resort, ResortRequest request) {
        if (request.name() != null && !request.name().isBlank()) {
            resort.setName(request.name());
        }
        if (request.location() != null && !request.location().isBlank()) {
            resort.setLocation(request.location());
        }
        if (request.adminEmail() != null && !request.adminEmail().isBlank()) {
            resort.setAdminEmail(request.adminEmail());
        }
        if (request.coverPhotoUrl() != null && !request.coverPhotoUrl().isBlank()) {
            resort.setCoverPhotoUrl(request.coverPhotoUrl());
        }
        if (request.description() != null && !request.description().isBlank()) {
            resort.setDescription(request.description());
        }
        if (request.amenityIds() != null) {
            resort.setAmenities(amenityRepository.findAllById(request.amenityIds()));
        }
    }

    public ResortResponse getMyResort(String adminEmail) {
        return mapToResponse(resortRepository.findByAdminEmail(adminEmail)
                .orElseThrow(() -> new ResortNotFoundException("No resort found for this admin")));
    }

    @Transactional
    public ResortResponse updateMyResort(String adminEmail, ResortRequest request) {
        Resort resort = resortRepository.findByAdminEmail(adminEmail)
                .orElseThrow(() -> new ResortNotFoundException("No resort found for this admin"));

        // El adminEmail NO se toca acá a propósito: este endpoint es "editar mi balneario", y
        // cambiarse el email de administrador por esta vía sería cambiar de dueño.
        String emailOriginal = resort.getAdminEmail();
        applyChanges(resort, request);
        resort.setAdminEmail(emailOriginal);

        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse toInactive(Long id) {
        Resort resort = resortRepository.findById(id).orElseThrow(() -> new ResortNotFoundException("Resort not found"));
        resort.setActive(false);
        return mapToResponse(resortRepository.save(resort));
    }

    @Transactional
    public ResortResponse toActive(Long id) {
        Resort resort = resortRepository.findById(id).orElseThrow(() -> new ResortNotFoundException("Resort not found"));
        resort.setActive(true);
        return mapToResponse(resortRepository.save(resort));
    }

    /**
     * Los números del Panel con gráficos de un balneario: el resumen de hoy, la ocupación por día,
     * los ingresos por mes y las unidades más reservadas del rango. Solo cuentan las reservas
     * confirmadas, salvo las pendientes del resumen de hoy, y se leen solo las del balneario que
     * tocan el rango.
     *
     * @throws InvalidBookingRangeException si viene una sola fecha, si {@code from} es posterior a
     *                                      {@code to} o si el rango pasa de 366 días.
     */
    @Transactional(readOnly = true)
    public ResortStatsResponse getResortStats(Long resortId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);

        // Sin fechas: del primer día del mes pasado al último del mes que viene.
        if (from == null && to == null) {
            from = today.minusMonths(1).withDayOfMonth(1);
            to = today.plusMonths(1).withDayOfMonth(today.plusMonths(1).lengthOfMonth());
        } else if (from == null || to == null) {
            throw new InvalidBookingRangeException("Van las dos fechas, from y to, o ninguna.");
        }

        if (from.isAfter(to)) {
            throw new InvalidBookingRangeException("La fecha from no puede ser posterior a to.");
        }
        // Los días se cuentan con los dos extremos, como en las reservas: del 01/01 al 01/01 del
        // año siguiente son 366.
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_STATS_DAYS) {
            throw new InvalidBookingRangeException("El rango puede tener hasta " + MAX_STATS_DAYS + " días.");
        }

        long totalUnits = rentalUnitRepository.countActiveUnitsByResort(resortId);
        List<Booking> bookings = bookingRepository.findConfirmedOverlappingRange(resortId, from, to);

        // 1. Hoy
        TodayStats todayStats = todayStats(resortId, today, totalUnits);

        // 2. Ocupación: unidades distintas con una reserva confirmada cada día del rango
        List<OccupancyDayStats> occupancyByDay = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            final LocalDate current = d;
            long occupied = bookings.stream()
                    .filter(b -> !b.getStartDate().isAfter(current) && !b.getEndDate().isBefore(current))
                    .map(b -> b.getRentalUnit().getIdRentalUnit())
                    .distinct()
                    .count();
            occupancyByDay.add(new OccupancyDayStats(current, occupied, totalUnits));
        }

        // 3. Ingresos: cada reserva suma entera en el mes en que empieza
        List<IncomeMonthStats> incomeByMonth = new ArrayList<>();
        YearMonth startMonth = YearMonth.from(from);
        YearMonth endMonth = YearMonth.from(to);
        for (YearMonth m = startMonth; !m.isAfter(endMonth); m = m.plusMonths(1)) {
            final YearMonth currentMonth = m;
            BigDecimal income = bookings.stream()
                    .filter(b -> YearMonth.from(b.getStartDate()).equals(currentMonth))
                    .map(Booking::getTotalPrice)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            incomeByMonth.add(new IncomeMonthStats(currentMonth.toString(), income.setScale(2, RoundingMode.HALF_UP)));
        }

        // 4. Unidades más reservadas: solo cuentan los días dentro del rango
        Map<RentalUnit, Long> unitDays = new HashMap<>();
        for (Booking b : bookings) {
            LocalDate overlapStart = b.getStartDate().isBefore(from) ? from : b.getStartDate();
            LocalDate overlapEnd = b.getEndDate().isAfter(to) ? to : b.getEndDate();
            long days = ChronoUnit.DAYS.between(overlapStart, overlapEnd) + 1;

            unitDays.merge(b.getRentalUnit(), days, Long::sum);
        }

        List<TopUnitStats> topUnits = unitDays.entrySet().stream()
                .filter(e -> e.getValue() > 0)
                .sorted((e1, e2) -> {
                    int daysCompare = Long.compare(e2.getValue(), e1.getValue());
                    return daysCompare != 0 ? daysCompare : e1.getKey().getIdentifier().compareTo(e2.getKey().getIdentifier());
                })
                .limit(5)
                .map(e -> new TopUnitStats(e.getKey().getIdRentalUnit(), e.getKey().getIdentifier(), e.getKey().getType(), e.getValue()))
                .toList();

        return new ResortStatsResponse(from, to, todayStats, occupancyByDay, incomeByMonth, topUnits);
    }

    /**
     * El resumen de hoy, que no depende del rango pedido: se leen aparte las reservas confirmadas
     * que incluyen hoy. Las personas son todas las de esas reservas, titular incluido, y las
     * unidades libres son las que se pueden usar y no tienen una de esas reservas.
     */
    private TodayStats todayStats(Long resortId, LocalDate today, long usableUnits) {
        List<Booking> active = bookingRepository.findConfirmedOverlappingRange(resortId, today, today);
        List<Guest> guests = active.stream()
                .filter(Booking::hasGuests)
                .flatMap(b -> b.getGuests().stream())
                .toList();
        long checkedIn = guests.stream()
                .filter(g -> g.enteredOn(today))
                .count();
        long occupiedUsable = active.stream()
                .map(Booking::getRentalUnit)
                .filter(u -> !Boolean.TRUE.equals(u.getIsBlocked()))
                .map(RentalUnit::getIdRentalUnit)
                .distinct()
                .count();
        return new TodayStats(active.size(), guests.size(), checkedIn,
                bookingRepository.countPendingByResort(resortId), usableUnits - occupiedUsable);
    }

    private ResortResponse mapToResponse(Resort r) {
        return mapToResponse(r, ratingsOf(List.of(r.getIdResort())).get(r.getIdResort()));
    }

    private ResortResponse mapToResponse(Resort r, ResortRating rating) {
        return mapToResponse(r, rating, null);
    }

    // MAPPER interno: Se encarga de transformar las listas anidadas de Resort a DTOs de Amenity y RentalUnit.
    // Las unidades dadas de baja no van: la ficha y el plano ya no las ofrecen (RF32). El administrador
    // las ve en GET /api/rental-units.
    private ResortResponse mapToResponse(Resort r, ResortRating rating, Long availableUnits) {
        List<AmenityResponse> amenities = (r.getAmenities() != null) ? r.getAmenities().stream()
                                                                       .map(a -> new AmenityResponse(a.getIdAmenity(), a.getName()))
                                                                       .toList() : List.of();

        List<RentalUnitResponse> units = (r.getRentalUnits() != null) ? r.getRentalUnits().stream()
                                                                        .filter(u -> !u.isRetired())
                                                                        .map(u -> new RentalUnitResponse(u.getIdRentalUnit(), u.getType(), u.getIdentifier(), u.getDailyPrice(), u.getIsBlocked(), r.getIdResort(), false))
                                                                        .toList() : List.of();

        return new ResortResponse(
                r.getIdResort(),
                r.getName(),
                r.getLocation(),
                r.getCoverPhotoUrl(),
                r.getDescription(),
                r.isActive(),
                amenities,
                units,
                // Sin reseñas, el promedio es null y no 0: un cero se leería como «lo calificaron mal».
                rating == null ? null
                        : BigDecimal.valueOf(rating.average()).setScale(1, RoundingMode.HALF_UP),
                rating == null ? 0 : rating.count(),
                availableUnits
        );
    }
}