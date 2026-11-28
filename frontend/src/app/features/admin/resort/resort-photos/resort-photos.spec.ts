import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { Resort, ResortPhoto } from '../../../../core/api/resort.models';
import { ResortPhotos } from './resort-photos';

const PHOTOS = `${environment.apiUrl}/api/resorts/my/photos`;
const MINE = `${environment.apiUrl}/api/resorts/my`;

const photo = (id: number): ResortPhoto => ({
  idPhoto: id,
  url: `http://api.test/fotos/${id}.jpg`,
});
const file = (name: string, type: string, bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type });

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('ResortPhotos', () => {
  let fixture: ComponentFixture<ResortPhotos>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let emitted: ResortPhoto[][];

  beforeEach(() => {
    // jsdom no trae los métodos de <dialog> ni las vistas previas de archivos.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    URL.createObjectURL ??= () => 'blob:vista-previa';
    URL.revokeObjectURL ??= () => undefined;

    TestBed.configureTestingModule({
      imports: [ResortPhotos],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(photos: ResortPhoto[]): Promise<void> {
    fixture = TestBed.createComponent(ResortPhotos);
    page = fixture.nativeElement;
    emitted = [];
    fixture.componentInstance.photosChange.subscribe((list) => {
      emitted.push(list);
      // Como la pantalla: la lista nueva vuelve a entrar.
      fixture.componentRef.setInput('photos', list);
    });
    fixture.componentRef.setInput('photos', photos);
    await fixture.whenStable();
  }

  const button = (label: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.getAttribute('aria-label') === label || text(b) === label,
    );

  it('lista las fotos en orden, con la primera como portada', async () => {
    await open([photo(1), photo(2), photo(3)]);

    const items = page.querySelectorAll('.photos__item');
    expect(items.length).toBe(3);
    expect(text(items[0])).toContain('Foto 1');
    expect(text(items[0])).toContain('Portada');
    expect(text(items[1])).not.toContain('Portada');
    expect(button('Subir la foto 1')!.disabled).toBe(true);
    expect(button('Bajar la foto 3')!.disabled).toBe(true);
    expect(button('Bajar la foto 1')!.disabled).toBe(false);
  });

  it('sin fotos, dice que la primera va a ser la portada', async () => {
    await open([]);

    expect(text(page.querySelector('.photos__empty'))).toContain(
      'La primera que subas va a ser la portada.',
    );
  });

  it('separa las que van de las que no, y dice cuál y por qué', async () => {
    await open([]);

    fixture.componentInstance.addFiles([
      file('playa.jpg', 'image/jpeg'),
      file('animada.gif', 'image/gif'),
      file('enorme.png', 'image/png', 5 * 1024 * 1024 + 1),
      file('carpa.webp', 'image/webp'),
    ]);
    await fixture.whenStable();

    expect(page.querySelectorAll('.photos__preview').length).toBe(2);
    const rejected = text(page.querySelector('.photos__rejected'));
    expect(rejected).toContain('«animada.gif» no es una foto jpg, png o webp.');
    expect(rejected).toContain('«enorme.png» pesa más de 5 MB.');
    expect(button('Subir 2 fotos')).toBeTruthy();
  });

  it('no deja pasar de 10 fotos', async () => {
    await open([1, 2, 3, 4, 5, 6, 7, 8, 9].map(photo));

    fixture.componentInstance.addFiles([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')]);
    await fixture.whenStable();

    expect(page.querySelectorAll('.photos__preview').length).toBe(1);
    expect(text(page.querySelector('.photos__rejected'))).toContain(
      '«b.jpg» no entra: el balneario tiene hasta 10 fotos.',
    );
    // Con la décima elegida, no se pueden elegir más.
    expect(button('Elegir fotos')!.disabled).toBe(true);
  });

  it('sube las elegidas juntas, avisa la lista nueva y lo dice', async () => {
    await open([photo(1)]);
    fixture.componentInstance.addFiles([file('a.jpg', 'image/jpeg'), file('b.png', 'image/png')]);
    await fixture.whenStable();

    button('Subir 2 fotos')!.click();
    const post = http.expectOne(PHOTOS);
    expect(post.request.method).toBe('POST');
    const body = post.request.body as FormData;
    expect(body.getAll('files').map((f) => (f as File).name)).toEqual(['a.jpg', 'b.png']);
    post.flush([photo(1), photo(2), photo(3)], { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(emitted).toEqual([[photo(1), photo(2), photo(3)]]);
    expect(page.querySelectorAll('.photos__preview').length).toBe(0);
    expect(text(page.querySelector('.z-alert--success'))).toContain('Subimos 2 fotos');
  });

  it('si el backend no las acepta, lo dice y deja las elegidas para volver a probar', async () => {
    await open([photo(1)]);
    fixture.componentInstance.addFiles([file('a.jpg', 'image/jpeg')]);
    await fixture.whenStable();

    button('Subir la foto')!.click();
    http
      .expectOne(PHOTOS)
      .flush(
        { error: 'Un balneario puede tener hasta 10 fotos: ya tiene 10 y estás subiendo 1.' },
        { status: 400, statusText: 'Bad Request' },
      );
    // Un 400 puede ser que en otra pestaña se subieron fotos: se trae la lista como está.
    http.expectOne(MINE).flush({ photos: [photo(1), photo(9)] } as Resort);
    await fixture.whenStable();

    expect(text(page.querySelector('.z-alert--danger'))).toContain('ya tiene 10');
    expect(page.querySelectorAll('.photos__preview').length).toBe(1);
    expect(emitted).toEqual([[photo(1), photo(9)]]);
  });

  it('bajar una foto manda el orden nuevo, y el foco sigue en ella', async () => {
    await open([photo(1), photo(2), photo(3)]);

    button('Bajar la foto 1')!.click();
    const put = http.expectOne(`${PHOTOS}/order`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ photoIds: [2, 1, 3] });
    put.flush([photo(2), photo(1), photo(3)]);
    await fixture.whenStable();

    expect(emitted).toEqual([[photo(2), photo(1), photo(3)]]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bajar la foto 2');
    expect(text(page.querySelector('[aria-live="polite"]'))).toBe('La foto pasó al lugar 2 de 3.');
  });

  it('subir la segunda la hace portada; el foco pasa al otro botón, que sigue habilitado', async () => {
    await open([photo(1), photo(2)]);

    button('Subir la foto 2')!.click();
    http.expectOne(`${PHOTOS}/order`).flush([photo(2), photo(1)]);
    await fixture.whenStable();

    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bajar la foto 1');
    expect(text(page.querySelector('[aria-live="polite"]'))).toContain('ahora es la portada');
  });

  it('un 400 al ordenar vuelve a traer las fotos como están', async () => {
    await open([photo(1), photo(2)]);

    button('Bajar la foto 1')!.click();
    http.expectOne(`${PHOTOS}/order`).flush(
      { error: 'El orden tiene que traer todas las fotos del balneario, cada una una vez.' },
      {
        status: 400,
        statusText: 'Bad Request',
      },
    );
    http.expectOne(MINE).flush({ photos: [photo(1)] } as Resort);
    await fixture.whenStable();

    expect(text(page.querySelector('.z-alert--danger'))).toContain('No se pudo cambiar el orden');
    expect(emitted).toEqual([[photo(1)]]);
  });

  it('borrar pide confirmación, y «Volver» no borra nada', async () => {
    await open([photo(1), photo(2)]);

    button('Borrar la foto 2')!.click();
    await fixture.whenStable();
    const dialog = page.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(text(dialog)).toContain('Es la foto 2.');

    button('Volver')!.click();
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(false);
    http.expectNone(`${PHOTOS}/2`);
  });

  it('al confirmar la borra y avisa la lista sin ella', async () => {
    await open([photo(1), photo(2)]);

    button('Borrar la foto 1')!.click();
    await fixture.whenStable();
    expect(text(page.querySelector('dialog'))).toContain('Es la foto 1, la portada.');
    button('Borrar')!.click();
    const del = http.expectOne(`${PHOTOS}/1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(emitted).toEqual([[photo(2)]]);
    expect(page.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(text(page.querySelector('.z-alert--success'))).toContain('Borramos la foto');
  });

  it('si ya no estaba (404), lo dice y trae las fotos como están', async () => {
    await open([photo(1), photo(2)]);

    button('Borrar la foto 2')!.click();
    await fixture.whenStable();
    button('Borrar')!.click();
    http
      .expectOne(`${PHOTOS}/2`)
      .flush(
        { error: 'Foto no encontrada con el ID: 2' },
        { status: 404, statusText: 'Not Found' },
      );
    http.expectOne(MINE).flush({ photos: [photo(1)] } as Resort);
    await fixture.whenStable();

    expect(text(page.querySelector('.z-alert--danger'))).toContain('No se pudo borrar la foto');
    expect(emitted).toEqual([[photo(1)]]);
  });
});
