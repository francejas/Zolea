package com.zolea.backend.services;

import com.zolea.backend.dtos.amenity.AmenityResponse;
import com.zolea.backend.dtos.rentalunit.RentalUnitResponse;
import com.zolea.backend.dtos.resort.*;
import com.zolea.backend.exceptions.booking.InvalidBookingRangeException;
import com.zolea.backend.exceptions.resort.ResortInvalidRegisterException;
import com.zolea.backend.exceptions.resort.ResortNotFoundException;
import com.zolea.backend.models.Amenity;
import com.zolea.backend.models.Booking;
import com.zolea.backend.models.RentalUnit;
import com.zolea.backend.models.Resort;
import com.zolea.backend.repositories.AmenityRepository;
import com.zolea.backend.repositories.BookingRepository;
import com.zolea.backend.repositories.RentalUnitRepository;
import com.zolea.backend.repositories.ResortRepository;
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
import java.util.Map;

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

    private final ResortRepository resortRepository;
    private final AmenityRepository amenityRepository;
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
        return resortRepository.findByIsActiveTrue().stream()
                .map(this::mapToResponse)
                .toList();
    }

    public ResortResponse getResortById(Long id) {
        Resort resort = resortRepository.findById(id)
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

    @Transactional(readOnly = true)
    public ResortStatsResponse getResortStats(Long resortId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);

        if (from == null && to == null) {
            from = today.minusMonths(1).withDayOfMonth(1);
            to = today.plusMonths(1).withDayOfMonth(today.plusMonths(1).lengthOfMonth());
        } else if (from == null || to == null) {
            throw new InvalidBookingRangeException("Debe proveer ambas fechas 'from' y 'to', o ninguna.");
        }

        if (from.isAfter(to)) {
            throw new InvalidBookingRangeException("La fecha 'from' no puede ser posterior a 'to'.");
        }
        if (ChronoUnit.DAYS.between(from, to) > 366) {
            throw new InvalidBookingRangeException("El rango no puede ser mayor a 366 días.");
        }

        long totalUnits = rentalUnitRepository.countActiveUnitsByResort(resortId);
        List<Booking> bookings = bookingRepository.findConfirmedOverlappingRange(resortId, from, to);

        // 1. Today Stats
        long activeBookings = 0;
        long expectedGuests = 0;
        long checkedIn = 0;

        for (Booking b : bookings) {
            if (!b.getStartDate().isAfter(today) && !b.getEndDate().isBefore(today)) {
                activeBookings++;

                if (b.getGuests() != null) {
                    expectedGuests += b.getGuests().size();

                    checkedIn += b.getGuests().stream()
                            .filter(g -> Boolean.TRUE.equals(g.getIsEntryValidated()))
                            .count();
                }
            }
        }
        TodayStats todayStats = new TodayStats(activeBookings, expectedGuests, checkedIn);

        // 2. Occupancy By Day
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

        // 3. Income By Month
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

        // 4. Top Units
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

    // MAPPER interno
    private ResortResponse mapToResponse(Resort r) {
        List<AmenityResponse> amenities = (r.getAmenities() != null) ? r.getAmenities().stream()
                .map(a -> new AmenityResponse(a.getIdAmenity(), a.getName()))
                .toList() : List.of();

        List<RentalUnitResponse> units = (r.getRentalUnits() != null) ? r.getRentalUnits().stream()
                .map(u -> new RentalUnitResponse(u.getIdRentalUnit(), u.getType(), u.getIdentifier(), u.getDailyPrice(), u.getIsBlocked(), r.getIdResort()))
                .toList() : List.of();

        return new ResortResponse(
                r.getIdResort(),
                r.getName(),
                r.getLocation(),
                r.getCoverPhotoUrl(),
                r.getDescription(),
                r.isActive(),
                amenities,
                units
        );
    }
}