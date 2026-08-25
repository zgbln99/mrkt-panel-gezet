import { normalizeUrl, setBaseUrl, getBaseUrl, api, ApiError, setAuthToken, setUnauthorizedHandler } from '../src/api';

describe('normalizeUrl', () => {
  it('dokleja schemat i końcówkę /api', () => {
    expect(normalizeUrl('marketing.firma.pl')).toBe('https://marketing.firma.pl/api');
  });

  it('nie dubluje /api, gdy użytkownik wkleił pełny adres', () => {
    expect(normalizeUrl('https://marketing.firma.pl/api')).toBe('https://marketing.firma.pl/api');
  });

  it('zachowuje http:// dla serwera w sieci lokalnej', () => {
    expect(normalizeUrl('http://192.168.1.10:4000')).toBe('http://192.168.1.10:4000/api');
  });

  it('obcina końcowe ukośniki', () => {
    expect(normalizeUrl('https://marketing.firma.pl///')).toBe('https://marketing.firma.pl/api');
  });

  it('pusty adres zostaje pusty', () => {
    expect(normalizeUrl('   ')).toBe('');
  });
});

describe('klient API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    setAuthToken(null);
    setUnauthorizedHandler(null);
  });

  it('bez ustawionego adresu serwera zgłasza czytelny błąd zamiast strzelać w pustkę', async () => {
    await setBaseUrl('');
    await expect(api.getMeta()).rejects.toMatchObject({ code: 'no_base_url' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('dokłada nagłówek Authorization tylko do żądań wymagających logowania', async () => {
    await setBaseUrl('example.test');
    setAuthToken('token-abc');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await api.getMeta();
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();

    await api.getRequests();
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token-abc');
  });

  it('przekazuje komunikat błędu z serwera, a nie własny ogólnik', async () => {
    await setBaseUrl('example.test');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Podaj imię i nazwisko.' }),
    });
    await expect(api.submitRequest({})).rejects.toThrow('Podaj imię i nazwisko.');
  });

  it('odrzucony token uruchamia obsługę wylogowania', async () => {
    await setBaseUrl('example.test');
    setAuthToken('stary-token');
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Sesja wygasła.', code: 'token_revoked' }),
    });

    await expect(api.getRequests()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledWith('token_revoked');
  });

  it('błąd sieci opisuje przyczynę zamiast surowego wyjątku fetch', async () => {
    await setBaseUrl('example.test');
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.getMeta()).rejects.toMatchObject({ code: 'network' });
  });

  it('adres bez szyfrowania tłumaczy, że to Android blokuje połączenie', async () => {
    // Android blokuje cleartext po cichu — zwykły komunikat o braku sieci
    // kierowałby szukanie problemu w zupełnie złą stronę.
    await setBaseUrl('http://203.0.113.10');
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(api.getMeta()).rejects.toThrow(/Android blokuje/);
  });

  it('sam adres IP jest uzupełniany do https', async () => {
    await setBaseUrl('203.0.113.10');
    expect(getBaseUrl()).toBe('https://203.0.113.10/api');
  });

  it('zapisany adres serwera jest używany przy kolejnych żądaniach', async () => {
    await setBaseUrl('marketing.firma.pl');
    expect(getBaseUrl()).toBe('https://marketing.firma.pl/api');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await api.getMeta();
    expect(global.fetch.mock.calls[0][0]).toBe('https://marketing.firma.pl/api/meta');
  });
});
