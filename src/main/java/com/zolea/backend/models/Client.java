package com.zolea.backend.models;

import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.ToString;
import java.util.List;

/**
 * <p><b>Sobre {@code equals}, {@code hashCode} y {@code toString}:</b> los tres se limitan al
 * identificador. {@code @Data} de Lombok los genera con <b>todos</b> los campos, y sobre relaciones
 * que apuntan en los dos sentidos eso es una recursión infinita — imprimir una entidad tiraba la
 * aplicación con {@code StackOverflowError}. La identidad de una entidad es su fila, no el
 * contenido de sus campos.
 *
 * <p>Queda una limitación conocida: el identificador lo asigna la base al guardar, así que el
 * {@code hashCode} de una entidad cambia entre antes y después de persistirla. Por eso una entidad
 * sin guardar no debe meterse en un {@code HashSet} ni usarse como clave de un {@code HashMap}.
 */
// Único en la base, no solo comprobado antes de guardar: un chequeo previo no impide que dos
// peticiones simultáneas lo pasen las dos.
@Table(name = "client", uniqueConstraints =
        @UniqueConstraint(name = "uk_cliente_telefono", columnNames = "phone"))
@Entity
@Data
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
public class Client {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    private Long idClient;

    private String firstName;

    private String lastName;

    @Column(unique = true)
    private String email;

    private String passwordHash;

    // La unicidad del teléfono se declara arriba, a nivel de tabla, y no acá con
    // @Column(unique = true). El motivo es práctico: con ddl-auto=update Hibernate aplica las
    // restricciones declaradas en @Table sobre una tabla que ya existe, pero NO las que van en la
    // definición de una columna existente. Con @Column, la restricción aparecía en las pruebas
    // —donde el esquema se crea de cero— y no en las bases de desarrollo y demostración.
    private String phone;

    @Column(unique = true)
    private String dni;

    @Column(nullable = false)
    private String role = "USER";  // "USER" o "ADMIN"

    /**
     * Si la cuenta puede ingresar (#72). Una cuenta no se borra, porque tiene reservas e historial:
     * la cuenta de Zolea la desactiva. Desactivada, no ingresa y su token deja de valer en el pedido
     * siguiente.
     */
    // Con valor por defecto en la base: las filas que ya existen quedan activas al agregar la columna.
    @Column(nullable = false, columnDefinition = "boolean default true")
    private boolean active = true;

    /**
     * El balneario que administra este cliente. Nulo para los clientes comunes.
     *
     * <p>Antes la pertenencia era el texto {@code Resort.adminEmail}, que no es una relación:
     * ninguna consulta podía filtrar por balneario, así que cada administrador veía y podía
     * modificar las unidades y las reservas de los cinco balnearios. Con la clave foránea, acotar
     * una consulta es un {@code where} y no una comparación de cadenas repartida por los servicios.
     *
     * <p>Varios administradores pueden compartir un balneario; un administrador tiene uno solo.
     */
    // Se deja EAGER a propósito, al revés que el resto de los @ManyToOne. Lo lee
    // CustomUserDetailsService para armar el UserPrincipal, y eso pasa dentro del filtro de JWT,
    // fuera de toda transacción: en LAZY reventaría con LazyInitializationException en cada
    // petición autenticada. Es una fila chica que se lee una vez por petición.
    @ManyToOne
    @JoinColumn(name = "id_managed_resort")
    @ToString.Exclude
    private Resort managedResort;

    // Relación bidireccional: Un cliente puede tener muchas reservas.
    // "mappedBy" le avisa a Spring Boot que la clave foránea ya se maneja en la clase Booking.
    @OneToMany(mappedBy = "client")
    @BatchSize(size = 25)
    @ToString.Exclude
    private List<Booking> bookings;
}