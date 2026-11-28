package com.zolea.backend.repositories;

import com.zolea.backend.models.Client;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ClientRepository extends JpaRepository<Client, Long> {

    // El perfil de un cliente incluye el resumen de sus reservas, y de cada una el identificador de
    // la unidad: sin esto, listar clientes era una consulta por cliente más otra por reserva.
    @Override
    @EntityGraph(attributePaths = {"bookings", "bookings.rentalUnit"})
    List<Client> findAll();

    @Override
    @EntityGraph(attributePaths = {"bookings", "bookings.rentalUnit"})
    Optional<Client> findById(Long id);

    // Metodo personalizado: Spring Boot automáticamente arma la consulta SQL
    // "SELECT * FROM client WHERE email = ?" solo con leer el nombre de este metodoo
    Optional<Client> findByEmail(String email);

    Optional<Client> findByPhone(String phone);

    Optional<Client> findByDni(String dni);

    /**
     * La lista de usuarios de la cuenta de Zolea (#72): busca en el nombre y apellido, el email y el
     * DNI, y filtra por tipo de cuenta ({@code CLIENT}, {@code RESORT_ADMIN} o {@code ZOLEA}).
     *
     * @param search en minúsculas y entre {@code %}, o null para no buscar.
     * @param type el nombre del tipo, o null para todos.
     */
    @Query("""
            select c from Client c
            where (:search is null
                   or lower(concat(c.firstName, ' ', c.lastName)) like :search
                   or lower(c.email) like :search
                   or c.dni like :search)
              and (:type is null
                   or (:type = 'CLIENT' and c.role <> 'ADMIN')
                   or (:type = 'RESORT_ADMIN' and c.role = 'ADMIN' and c.managedResort is not null)
                   or (:type = 'ZOLEA' and c.role = 'ADMIN' and c.managedResort is null))
            """)
    Page<Client> searchAccounts(@Param("search") String search, @Param("type") String type, Pageable pageable);

    /** Los administradores de balneario: la lista de balnearios de la cuenta de Zolea dice quién lleva cada uno. */
    List<Client> findByManagedResortIsNotNull();

}