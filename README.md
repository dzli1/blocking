# blocking
A lightweight, self-hosted website blocker for productivity.


'''
Site Blocker — Productivity Tool
=================================
Monitors and blocks distracting websites by modifying the system hosts file.
Redirects blocked sites to a local control panel (localhost).

Usage:
    sudo python3 daemon/site_blocker.py                       # Start with default blocklist
    sudo python3 daemon/site_blocker.py --config config.json  # Use a config file

    Then open http://127.0.0.1:9099/panel.html in your browser

Requires root/admin privileges to modify the hosts file.
'''