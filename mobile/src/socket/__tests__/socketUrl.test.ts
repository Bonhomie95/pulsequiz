import { socketUrl } from '../socket';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('@/src/utils/storage', () => ({ storage: { getToken: jest.fn() } }));

describe('socketUrl', () => {
  it('drops the /api path so socket.io uses the default namespace', () => {
    expect(socketUrl('https://api.pulsequiz.app/api')).toBe('https://api.pulsequiz.app');
    expect(socketUrl('http://192.168.1.2:8000/api/')).toBe('http://192.168.1.2:8000');
  });
  it('leaves a bare origin alone', () => {
    expect(socketUrl('https://api.pulsequiz.app')).toBe('https://api.pulsequiz.app');
  });
});
