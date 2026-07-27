import asyncio, os, httpx
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def run():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    u = await db.users.find_one({'phone': '+2348000173067'})
    old_balance = float(u.get('wallet_balance') or 0)
    print(f'user={u["phone"]} name={u["name"]} wallet BEFORE: ₦{old_balance}')

    API = None
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                API = line.split('=', 1)[1].strip() + '/api'

    # SEPARATE CLIENTS — no shared cookies between admin and user
    admin_c = httpx.AsyncClient(base_url=API, timeout=15)
    user_c = httpx.AsyncClient(base_url=API, timeout=15)
    try:
        # Admin login
        r = await admin_c.post('/auth/login',
                               json={'email': 'billdennis750@gmail.com', 'password': 'djscan30'})
        admin_token = r.json()['access_token']
        # Mint impersonation token (does not mutate any cookies)
        r = await admin_c.post(f'/admin/users/{u["_id"]}/impersonate-token',
                               headers={'Authorization': f'Bearer {admin_token}'})
        user_token = r.json()['access_token']
        # User creates deposit via a DIFFERENT client with only Bearer auth (no cookies)
        r = await user_c.post('/deposits',
                              json={'amount': 750, 'method': 'manual', 'reference': 'reg'},
                              headers={'Authorization': f'Bearer {user_token}'})
        assert r.status_code == 200, r.text
        dep = r.json()
        did = dep['id']
        print(f'Deposit {did} status={dep["status"]} amount=₦{dep["amount"]} user_id={dep.get("user_id")}')
        # Admin approves
        r = await admin_c.post(f'/admin/deposits/{did}/approve',
                               json={'note': 'regression'},
                               headers={'Authorization': f'Bearer {admin_token}'})
        print(f'Approve ({r.status_code}): {r.text}')
        assert r.status_code == 200
        resp = r.json()
        # Verify DB balance
        u2 = await db.users.find_one({'_id': u['_id']})
        new_bal = float(u2['wallet_balance'])
        delta = new_bal - old_balance
        print(f'wallet AFTER: ₦{new_bal} (delta ₦{delta})')
        assert abs(delta - 750) < 0.01, f'Expected +750 got +{delta}'
        # Test double-approve blocked
        r2 = await admin_c.post(f'/admin/deposits/{did}/approve',
                                json={'note': 'again'},
                                headers={'Authorization': f'Bearer {admin_token}'})
        print(f'Double-approve status={r2.status_code} body={r2.text[:120]}')
        assert r2.status_code == 400
        # Cleanup
        await db.users.update_one({'_id': u['_id']}, {'$inc': {'wallet_balance': -750}})
        await db.deposits.delete_one({'_id': ObjectId(did)})
        await db.transactions.delete_many({'meta.deposit_id': did})
        print('Cleanup OK. Test PASSED ✅')
    finally:
        await admin_c.aclose()
        await user_c.aclose()

asyncio.run(run())
